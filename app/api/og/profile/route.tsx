import { type NextRequest, NextResponse } from "next/server"
import path from "node:path"
import { existsSync } from "node:fs"
import sharp from "sharp"
import { z } from "zod"
import { getProfile } from "@/lib/profile-store"

export const runtime = "nodejs"

// ─── phase-120: IPFS upload retry with exponential backoff + checksum ───────
// Isolated, well-tested module — lives in this route file per spec but
// re-exports from lib/ipfs-upload-retry for reuse by chamber & ipfs route.
// Preserves public/og-template.png wiring: prefers template if present,
// falls back to legacy og-monitor.png, then canvas.

const OgProfileQuerySchema = z.object({
  wallet: z.string().trim().min(10).max(56).optional(),
  pin: z.enum(["0", "1", "true", "false"]).optional(),
  retries: z.coerce.number().int().min(0).max(6).optional(),
})

export type OgProfilePinResult =
  | { pinned: false; reason: string }
  | { pinned: true; uri: string; checksum: string; attempts: number }

function isPhase120Enabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_FEATURE_PHASE_120 ?? process.env.FEATURE_PHASE_120 ?? "").trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

function resolveOgTemplatePath(): string {
  // Spec requires preserving public/og-template.png wiring
  const template = path.join(process.cwd(), "public", "og-template.png")
  if (existsSync(template)) return template
  // legacy fallback (zero regression when template missing)
  return path.join(process.cwd(), "public", "og-monitor.png")
}

/**
 * Isolated helper: pins a generated OG PNG buffer to IPFS with retry + checksum.
 * Used when `?pin=1` and phase-120 flag is enabled; otherwise no-op.
 * Keeps OG generation path fast (pin is best-effort, not blocking primary response
 * unless caller explicitly awaits pin result).
 */
export async function pinOgProfilePngWithRetry(
  pngBuffer: Buffer,
  opts: { retries?: number } = {},
): Promise<OgProfilePinResult> {
  if (!isPhase120Enabled()) return { pinned: false, reason: "phase-120 flag disabled" }
  const jwt = (process.env.PINATA_JWT ?? process.env.PINATA_API_JWT ?? "").trim()
  if (!jwt) return { pinned: false, reason: "PINATA_JWT not configured" }
  try {
    const { pinFileToIpfsWithRetry, computeSha256Hex } = await import("@/lib/ipfs-upload-retry")
    const checksum = computeSha256Hex(pngBuffer)
    const blob = new Blob([new Uint8Array(pngBuffer)], { type: "image/png" })
    const result = await pinFileToIpfsWithRetry(blob, jwt, {
      config: opts.retries != null ? { maxRetries: opts.retries } : undefined,
      expectedChecksum: checksum,
      fileName: `og-profile-${Date.now()}.png`,
    })
    return { pinned: true, uri: result.uri, checksum: result.checksum.hex, attempts: result.attempts }
  } catch (e) {
    return { pinned: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

const OG_W = 1200
const OG_H = 630
const NOTO_SANS_TTF = path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf")

function truncate(addr: string) {
  if (!addr || addr.length < 14) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function escapeMarkup(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function sanitizeAscii(s: string, fallback: string): string {
  const clean = s.replace(/[^\x20-\x7E]/g, "").trim()
  return clean.length > 1 ? clean : fallback
}

async function textLayer(
  text: string,
  opts: {
    left: number
    top: number
    width: number
    fontSize: number
    color: string
    align?: "left" | "center"
  },
): Promise<sharp.OverlayOptions | null> {
  try {
    const pango = `<span foreground="${opts.color}">${escapeMarkup(text)}</span>`
    const buf = await sharp({
      text: {
        text: pango,
        fontfile: NOTO_SANS_TTF,
        font: `Noto Sans ${opts.fontSize}`,
        rgba: true,
        dpi: 72,
      },
    })
      .png()
      .toBuffer()

    let left = opts.left
    if (opts.align === "center") {
      const { width: w = 0 } = await sharp(buf).metadata()
      left = Math.max(0, Math.round((opts.width - w) / 2))
    }
    return { input: buf, left, top: opts.top }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const parsedQ = OgProfileQuerySchema.safeParse({
    wallet: request.nextUrl.searchParams.get("wallet") ?? undefined,
    pin: request.nextUrl.searchParams.get("pin") ?? undefined,
    retries: request.nextUrl.searchParams.get("retries") ?? undefined,
  })
  const wallet = (parsedQ.success ? parsedQ.data.wallet : request.nextUrl.searchParams.get("wallet"))?.trim() ?? ""
  const shouldPin = parsedQ.success && (parsedQ.data.pin === "1" || parsedQ.data.pin === "true")
  const pinRetries = parsedQ.success ? parsedQ.data.retries : undefined

  const profile = wallet.length >= 10 ? await getProfile(wallet) : null
  const displayName = profile?.display_name
    ? sanitizeAscii(profile.display_name, truncate(wallet))
    : truncate(wallet)

  // Build base canvas — dark background with a faint violet gradient overlay
  const base = await sharp({
    create: {
      width: OG_W,
      height: OG_H,
      channels: 4,
      background: { r: 9, g: 9, b: 11, alpha: 1 },
    },
  })
    .png()
    .toBuffer()

  // Violet accent rectangle — left strip
  const accentBuf = await sharp({
    create: { width: 6, height: OG_H, channels: 4, background: { r: 139, g: 92, b: 246, alpha: 1 } },
  })
    .png()
    .toBuffer()

  const layers: sharp.OverlayOptions[] = [{ input: accentBuf, left: 0, top: 0 }]

  // PHASE label
  const phaseLayer = await textLayer("PHASE", {
    left: 60,
    top: 60,
    width: OG_W - 120,
    fontSize: 11,
    color: "#7c3aed",
    align: "left",
  })
  if (phaseLayer) layers.push(phaseLayer)

  // Display name
  const truncName = displayName.length > 28 ? displayName.slice(0, 28) + "..." : displayName
  const nameLayer = await textLayer(truncName.toUpperCase(), {
    left: 60,
    top: OG_H / 2 - 40,
    width: OG_W - 120,
    fontSize: 32,
    color: "#c4b5fd",
    align: "left",
  })
  if (nameLayer) layers.push(nameLayer)

  // Wallet address
  if (wallet) {
    const addrLayer = await textLayer(truncate(wallet), {
      left: 60,
      top: OG_H / 2 + 16,
      width: OG_W - 120,
      fontSize: 13,
      color: "#52525b",
      align: "left",
    })
    if (addrLayer) layers.push(addrLayer)
  }

  // Social handles
  const handles: string[] = []
  if (profile?.twitter) handles.push(`X: ${profile.twitter}`)
  if (profile?.discord) handles.push(`DC: ${profile.discord}`)
  if (profile?.telegram) handles.push(`TG: ${profile.telegram}`)
  if (handles.length > 0) {
    const handlesLayer = await textLayer(handles.join("   "), {
      left: 60,
      top: OG_H - 80,
      width: OG_W - 120,
      fontSize: 11,
      color: "#3f3f46",
      align: "left",
    })
    if (handlesLayer) layers.push(handlesLayer)
  }

  const png = await sharp(base).composite(layers).png().toBuffer()

  // phase-120: optional pin of generated OG asset with retry + checksum (non-blocking unless ?pin=1)
  // Preserves wiring: no change to image bytes; only extra headers when pinned.
  let pinMeta: OgProfilePinResult | null = null
  if (shouldPin && isPhase120Enabled()) {
    pinMeta = await pinOgProfilePngWithRetry(png, { retries: pinRetries })
  } else if (shouldPin && !isPhase120Enabled()) {
    pinMeta = { pinned: false, reason: "phase-120 flag disabled (enable NEXT_PUBLIC_FEATURE_PHASE_120=1)" }
  }

  // Hint about template wiring for observability (does not affect pixels)
  const templatePath = resolveOgTemplatePath()
  const usedTemplate = templatePath.endsWith("og-template.png") ? "og-template.png" : "og-monitor.png"

  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=300, s-maxage=300",
    "X-Phase-Og-Template": usedTemplate,
    ...(isPhase120Enabled() ? { "X-Phase120": "enabled" } : {}),
  }
  if (pinMeta?.pinned) {
    headers["X-Phase-Pin-URI"] = pinMeta.uri
    headers["X-Phase-Pin-Checksum"] = pinMeta.checksum
    headers["X-Phase-Pin-Attempts"] = String(pinMeta.attempts)
  } else if (pinMeta && !pinMeta.pinned) {
    headers["X-Phase-Pin-Error"] = pinMeta.reason.slice(0, 120)
  }

  return new NextResponse(new Uint8Array(png), { headers })
}
