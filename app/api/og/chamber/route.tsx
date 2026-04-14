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
 * Renderiza texto sobre el monitor usando SVG — garantiza centrado correcto.
 * `align: "center"` usa text-anchor="middle" en x = width/2, así el buffer
 * de width px cubre toda la fila y queda centrado con left=0.
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
    const x = align === "center" ? opts.width / 2 : align === "right" ? opts.width : 0
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start"
    const ls = opts.letterSpacing ?? 2

    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}">` +
      `<text x="${x}" y="${opts.fontSize}" text-anchor="${anchor}" ` +
      `font-family="monospace" font-size="${opts.fontSize}px" fill="${opts.color}" ` +
      `letter-spacing="${ls}">${escapeMarkup(text)}</text></svg>`,
    )

    const buf = await sharp(svg).png().toBuffer()
    return { input: buf, left: opts.left, top: opts.top }
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
  const displayName = nftName.length > 30 ? nftName.slice(0, 30) + "…" : nftName
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
    imageUri = collection?.imageUri?.trim() ?? ""
    displayName = collection?.name?.trim() || null

    // Try fetching token_uri for collectionId as a cheap first guess —
    // in many collections the tokenId correlates with the collectionId.
    // If it resolves, prefer its metadata (name + image) over the collection-level data.
    const tokenUri = await fetchTokenUriString(collectionId).catch(() => null)
    if (tokenUri) {
      const meta = await fetchTokenMetadataDisplay(tokenUri).catch(() => ({ image: undefined, name: undefined }))
      if (meta.name) displayName = meta.name
      if (meta.image) imageUri = meta.image
    }
  } catch {
    // Fall through with whatever we resolved so far
  }

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

  // Name — only if resolved; centered at MON_NAME_TOP, same as token flow
  if (displayName) {
    const truncated = displayName.length > 30 ? displayName.slice(0, 30) + "…" : displayName
    const nameLayer = await monitorTextLayer(truncated.toUpperCase(), {
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
