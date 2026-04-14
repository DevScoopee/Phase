import { type NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import {
  fetchCollectionInfo,
  extractIpfsGatewaySubpath,
  fetchTokenUriString,
  fetchTokenMetadataDisplay,
} from "@/lib/phase-protocol"
import { publicPhaseSiteBaseUrl } from "@/lib/phase-nft-metadata-build"

export const runtime = "nodejs"

const OG_W = 1200
const OG_H = 630

// ─── Monitor layout (og-monitor.png) — shared by both token and collection OG ─
// Token ID badge — a la derecha del texto "PHASE: _" en la imagen de fondo
const MON_BADGE_LEFT      = 340
const MON_BADGE_TOP       = 80
const MON_BADGE_FONT_SIZE = 13
// NFT image inside the screen — pixel-perfect, do not touch
const MON_NFT_LEFT   = 522
const MON_NFT_TOP    = 199
const MON_NFT_WIDTH  = 150
const MON_NFT_HEIGHT = 210
// NFT name — centered horizontally in the full 1200px canvas
const MON_NAME_TOP = 473

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

function escapeMarkup(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * Strip every character outside printable ASCII (0x20–0x7E).
 * Keeps any ASCII portion of mixed names (e.g. "日本語 ARTIFACT" → "ARTIFACT").
 * Falls back when the stripped result is too short to be meaningful.
 */
function sanitizeForSharp(name: string, fallback: string): string {
  const clean = name.replace(/[^\x20-\x7E]/g, "").trim()
  return clean.length > 2 ? clean : fallback
}

/** Absolute path to the bundled NotoSans TTF — used by sharp's Pango renderer. */
const NOTO_SANS_TTF = path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf")

/**
 * Renders text as a PNG overlay using sharp's native Pango text input and the
 * bundled NotoSans TTF. Works on Vercel (Amazon Linux 2) without any system font.
 *
 * Centering: renders at natural width, measures the result, then computes left
 * offset — avoids SVG @font-face issues with librsvg on Lambda.
 */
async function monitorTextLayer(
  text: string,
  opts: {
    left: number
    top: number
    width: number
    height: number
    fontSize: number
    color: string
    align?: "left" | "center" | "right"
    letterSpacing?: number
  },
): Promise<sharp.OverlayOptions | null> {
  try {
    const align = opts.align ?? "left"

    // Pango markup: escape XML special chars, wrap in <span> for color
    const escaped = escapeMarkup(text)
    const pango = `<span foreground="${opts.color}">${escaped}</span>`

    const textBuf = await sharp({
      text: {
        text: pango,
        fontfile: NOTO_SANS_TTF,
        font: `Noto Sans ${opts.fontSize}`,
        rgba: true,
        dpi: 144,
      },
    })
      .png()
      .toBuffer()

    let finalLeft = opts.left
    if (align === "center") {
      const { width: textW = 0 } = await sharp(textBuf).metadata()
      finalLeft = Math.max(0, Math.round((opts.width - textW) / 2))
    } else if (align === "right") {
      const { width: textW = 0 } = await sharp(textBuf).metadata()
      finalLeft = Math.max(0, opts.left + opts.width - textW)
    }

    return { input: textBuf, left: finalLeft, top: opts.top }
  } catch {
    return null
  }
}

// ─── Token-level OG renderer ──────────────────────────────────────────────────

async function renderTokenOg(
  tokenId: number,
  base: string,
): Promise<NextResponse> {
  const monitorPath = path.join(process.cwd(), "public", "og-monitor.png")
  const monitorBuf = await readFile(monitorPath)
  const baseBuf = await sharp(monitorBuf)
    .resize(OG_W, OG_H, { fit: "cover", position: "centre" })
    .toBuffer()

  const layers: sharp.OverlayOptions[] = []

  let nftName = "PHASE ARTIFACT"

  try {
    const tokenUri = await fetchTokenUriString(tokenId)
    if (tokenUri) {
      const meta = await fetchTokenMetadataDisplay(tokenUri)
      if (meta.name) nftName = meta.name

      // Resolve image URL through internal IPFS proxy
      const imageUri = meta.image ?? ""
      let nftUrl: string | null = null
      if (/^https?:\/\//i.test(imageUri)) {
        nftUrl = imageUri
      } else {
        const ipfsPath = extractIpfsGatewaySubpath(imageUri)
        if (ipfsPath) nftUrl = `${base}/api/ipfs/${ipfsPath}`
      }

      if (nftUrl) {
        const nftBuf = await fetchImageBuffer(nftUrl)
        if (nftBuf) {
          const resized = await sharp(nftBuf)
            .resize(MON_NFT_WIDTH, MON_NFT_HEIGHT, { fit: "cover", position: "centre" })
            .toBuffer()
          layers.push({ input: resized, left: MON_NFT_LEFT, top: MON_NFT_TOP })
        }
      }
    }
  } catch {
    // Render monitor-only on any failure
  }

  // Token ID badge — top-right of PHASE text
  const badgeLayer = await monitorTextLayer(`#${tokenId}`, {
    left: MON_BADGE_LEFT,
    top: MON_BADGE_TOP,
    width: 160,
    height: MON_BADGE_FONT_SIZE + 6,
    fontSize: MON_BADGE_FONT_SIZE,
    color: "#c4b5fd",
    align: "left",
  })
  if (badgeLayer) layers.push(badgeLayer)

  // NFT name — centered horizontally in the full 1200px canvas
  const rawName = nftName.length > 30 ? nftName.slice(0, 30) + "…" : nftName
  const displayName = sanitizeForSharp(rawName, `PHASE ARTIFACT #${tokenId}`)
  const nameLayer = await monitorTextLayer(displayName.toUpperCase(), {
    left: 0,
    top: MON_NAME_TOP,
    width: OG_W,
    height: 28,
    fontSize: 18,
    color: "#e2e8f0",
    align: "center",
    letterSpacing: 3,
  })
  if (nameLayer) layers.push(nameLayer)


  const pngBuffer = await sharp(baseBuf).composite(layers).png().toBuffer()

  return new NextResponse(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, must-revalidate",
    },
  })
}

/** Resuelve imagen y nombre para un URI de imagen o metadata. */
function resolveImageUrl(uri: string, base: string): string | null {
  if (!uri) return null
  if (/^https?:\/\//i.test(uri)) return uri
  const ipfsPath = extractIpfsGatewaySubpath(uri)
  return ipfsPath ? `${base}/api/ipfs/${ipfsPath}` : null
}

// ─── Collection-level OG renderer (og-monitor.png) ───────────────────────────

async function renderCollectionOg(
  collectionId: number,
  base: string,
): Promise<NextResponse> {
  const monitorPath = path.join(process.cwd(), "public", "og-monitor.png")
  const monitorBuf = await readFile(monitorPath)
  const baseBuf = await sharp(monitorBuf)
    .resize(OG_W, OG_H, { fit: "cover", position: "centre" })
    .toBuffer()

  const layers: sharp.OverlayOptions[] = []
  let displayName: string | null = null
  let imageUri = ""

  try {
    const collection = await fetchCollectionInfo(collectionId)
    console.log("[og/chamber fetchCollectionInfo raw]", JSON.stringify(collection))
    imageUri = collection?.imageUri?.trim() ?? ""
    displayName = collection?.name?.trim() || null
  } catch {
    // Fall through with whatever we resolved so far
  }

  // DEBUG — remove after confirming output
  console.log("[og/chamber collection]", { collectionId, displayName, imageUri: imageUri.slice(0, 80) })

  // NFT image layer — same screen coordinates as the token flow
  if (imageUri) {
    const nftUrl = resolveImageUrl(imageUri, base)
    if (nftUrl) {
      const nftBuf = await fetchImageBuffer(nftUrl)
      if (nftBuf) {
        const resized = await sharp(nftBuf)
          .resize(MON_NFT_WIDTH, MON_NFT_HEIGHT, { fit: "cover", position: "centre" })
          .toBuffer()
        layers.push({ input: resized, left: MON_NFT_LEFT, top: MON_NFT_TOP })
      }
    }
  }

  // Badge #collectionId
  const badgeLayer = await monitorTextLayer(`#${collectionId}`, {
    left: MON_BADGE_LEFT,
    top: MON_BADGE_TOP,
    width: 160,
    height: MON_BADGE_FONT_SIZE + 6,
    fontSize: MON_BADGE_FONT_SIZE,
    color: "#c4b5fd",
    align: "left",
  })
  console.log("[og/chamber collection] badgeLayer:", badgeLayer ? "OK" : "NULL")
  if (badgeLayer) layers.push(badgeLayer)

  // Name — centered at MON_NAME_TOP; only if resolved
  if (displayName) {
    const rawTrunc = displayName.length > 30 ? displayName.slice(0, 30) + "…" : displayName
    const safeName = sanitizeForSharp(rawTrunc, `PHASE COLLECTION #${collectionId}`)
    const nameLayer = await monitorTextLayer(safeName.toUpperCase(), {
      left: 0,
      top: MON_NAME_TOP,
      width: OG_W,
      height: 32,
      fontSize: 18,
      color: "#e2e8f0",
      align: "center",
      letterSpacing: 3,
    })
    console.log("[og/chamber collection] nameLayer:", nameLayer ? "OK" : "NULL")
    if (nameLayer) layers.push(nameLayer)
  }

  const pngBuffer = await sharp(baseBuf).composite(layers).png().toBuffer()

  return new NextResponse(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, must-revalidate",
    },
  })
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const base = publicPhaseSiteBaseUrl()
  const { searchParams } = request.nextUrl

  // Token-level OG (individual NFT)
  const rawToken = searchParams.get("token_id") ?? searchParams.get("token")
  const tokenId = rawToken ? parseInt(rawToken, 10) : NaN
  if (Number.isFinite(tokenId) && tokenId > 0) {
    return renderTokenOg(tokenId, base)
  }

  // Collection-level OG — monitor frame with best-effort token metadata
  const rawCollection = searchParams.get("collection")
  const collectionId = rawCollection ? parseInt(rawCollection, 10) : NaN

  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    // No params — serve the bare monitor as fallback
    const monitorPath = path.join(process.cwd(), "public", "og-monitor.png")
    const monitorBuf = await readFile(monitorPath)
    const pngBuffer = await sharp(monitorBuf)
      .resize(OG_W, OG_H, { fit: "cover", position: "centre" })
      .png()
      .toBuffer()
    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store, must-revalidate" },
    })
  }

  return renderCollectionOg(collectionId, base)
}
