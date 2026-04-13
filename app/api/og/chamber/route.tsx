import { type NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { fetchCollectionInfo, extractIpfsGatewaySubpath } from "@/lib/phase-protocol"
import { publicPhaseSiteBaseUrl } from "@/lib/phase-nft-metadata-build"

export const runtime = "nodejs"

const OG_W = 1200
const OG_H = 630

// NFT image position — calibrated to fill the inner black rectangle of the purple neon frame.
// Derived by pixel-analyzing the CRT frame at 2752x1536, then scaling to OG output (1200x630 cover).
const NFT_LEFT   = 532
const NFT_TOP    = 219
const NFT_WIDTH  = 136
const NFT_HEIGHT = 132

// Text is placed below the NFT frame (NFT_TOP + NFT_HEIGHT + gap)
const TEXT_TOP_OFFSET = 10

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
    const escaped = name
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
    const buf = await sharp({
      text: {
        text: `<span foreground="white" weight="bold">${escaped}</span>`,
        font: "sans",
        fontSize: 42,
        dpi: 200,
        rgba: true,
      },
    }).png().toBuffer()
    const meta = await sharp(buf).metadata()
    const tw = meta.width ?? 0
    const left = Math.max(0, Math.round((OG_W - tw) / 2))
    const top = NFT_TOP + NFT_HEIGHT + TEXT_TOP_OFFSET
    return { input: buf, left, top }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const base = publicPhaseSiteBaseUrl()
  const { searchParams } = request.nextUrl
  const rawCollection = searchParams.get("collection")
  const collectionId = rawCollection ? parseInt(rawCollection, 10) : NaN

  // 1. Load and resize CRT frame to OG dimensions
  const crtPath = path.join(process.cwd(), "public", "og-crt-frame.png")
  const crtBuf = await readFile(crtPath)
  const baseBuf = await sharp(crtBuf)
    .resize(OG_W, OG_H, { fit: "cover", position: "centre" })
    .toBuffer()

  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    const png = await sharp(baseBuf).png().toBuffer()
    return new NextResponse(png, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    })
  }

  const layers: sharp.OverlayOptions[] = []

  try {
    const collection = await fetchCollectionInfo(collectionId)
    const collectionName = collection?.name ?? ""
    const uri = collection?.imageUri?.trim() ?? ""

    // NFT image layer
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

    // Name text layer
    if (collectionName) {
      const textLayer = await nameTextLayer(collectionName)
      if (textLayer) layers.push(textLayer)
    }
  } catch {
    // Render frame-only if something fails
  }

  const png = await sharp(baseBuf).composite(layers).png().toBuffer()

  return new NextResponse(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  })
}
