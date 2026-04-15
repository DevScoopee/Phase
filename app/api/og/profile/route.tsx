import { type NextRequest, NextResponse } from "next/server"
import path from "node:path"
import sharp from "sharp"
import { getProfile } from "@/lib/profile-store"

export const runtime = "nodejs"

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
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim() ?? ""

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

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  })
}
