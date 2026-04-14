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

// ─── Collection-level layout (og-crt-frame.png) ───────────────────────────────
const NFT_LEFT   = 532
const NFT_TOP    = 219
const NFT_WIDTH  = 136
const NFT_HEIGHT = 90

const TEXT_AREA_LEFT  = 532
const TEXT_AREA_WIDTH = 136
const TEXT_AREA_TOP   = 315  // NFT_TOP(219) + NFT_HEIGHT(90) + offset(6)

// ─── Token-level layout (og-monitor.png / ChamberOG.png) ─────────────────────
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

async function nameTextLayer(name: string): Promise<sharp.OverlayOptions | null> {
  try {
    const displayName = name.length > 20 ? name.slice(0, 18) + ".." : name

    const buf = await sharp({
      create: {
        width: TEXT_AREA_WIDTH,
        height: 32,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            text: {
              text: displayName,
              font: "Inter-Bold 14px",
              rgba: true,
              width: TEXT_AREA_WIDTH,
              align: "center",
            },
          }).png().toBuffer(),
          gravity: "center",
        },
      ])
      .png()
      .toBuffer()

    return { input: buf, left: TEXT_AREA_LEFT, top: TEXT_AREA_TOP }
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
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
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

  // Collection-level OG (existing behavior)
  const rawCollection = searchParams.get("collection")
  const collectionId = rawCollection ? parseInt(rawCollection, 10) : NaN

  const crtPath = path.join(process.cwd(), "public", "og-crt-frame.png")
  const crtBuf = await readFile(crtPath)
  const baseBuf = await sharp(crtBuf)
    .resize(OG_W, OG_H, { fit: "cover", position: "centre" })
    .toBuffer()

  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    const pngBuffer = await sharp(baseBuf).png().toBuffer()
    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    })
  }

  const layers: sharp.OverlayOptions[] = []

  try {
    const collection = await fetchCollectionInfo(collectionId)
    const collectionName = collection?.name ?? ""
    const uri = collection?.imageUri?.trim() ?? ""

    if (uri) {
      let nftUrl: string | null = null
      if (/^https?:\/\//i.test(uri)) {
        nftUrl = uri
      } else {
        const ipfsPath = extractIpfsGatewaySubpath(uri)
        if (ipfsPath) nftUrl = `${base}/api/ipfs/${ipfsPath}`
      }
      if (nftUrl) {
        const nftBuf = await fetchImageBuffer(nftUrl)
        if (nftBuf) {
          const nftResized = await sharp(nftBuf)
            .resize(NFT_WIDTH, NFT_HEIGHT, { fit: "cover", position: "centre" })
            .toBuffer()
          layers.push({ input: nftResized, left: NFT_LEFT, top: NFT_TOP })
        }
      }
    }

    if (collectionName) {
      const textLayer = await nameTextLayer(collectionName)
      if (textLayer) layers.push(textLayer)
    }
  } catch {
    // Render frame-only if something fails
  }

  const pngBuffer = await sharp(baseBuf).composite(layers).png().toBuffer()

  return new NextResponse(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  })
}
