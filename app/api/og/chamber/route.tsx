import { type NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { fetchCollectionInfo, extractIpfsGatewaySubpath } from "@/lib/phase-protocol"
import { publicPhaseSiteBaseUrl } from "@/lib/phase-nft-metadata-build"

export const runtime = "nodejs"

const OG_W = 1200
const OG_H = 630

// NFT image position — fills the upper portion of the inner black rectangle.
// The frame inner area is left=532 top=219 w=136 h=132 (bottom=351).
// NFT takes the top ~68% leaving ~42px at the bottom for the collection name.
const NFT_LEFT   = 532
const NFT_TOP    = 219
const NFT_WIDTH  = 136
const NFT_HEIGHT = 90

// Collection name text area — inside the frame's inner black rectangle
// Frame inner area: left=532 top=219 w=136 h=132 (bottom=351)
// NFT takes top 90px, so text goes in the remaining ~42px at the bottom
const TEXT_AREA_LEFT = 532
const TEXT_AREA_WIDTH = 136
const TEXT_AREA_TOP = 315  // NFT_TOP(219) + NFT_HEIGHT(90) + offset(6)

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
    // Truncate long names
    const displayName = name.length > 20 ? name.slice(0, 18) + ".." : name

    // Create text image with exact dimensions to fit in the frame
    // sharp text API: font includes size, use simple text without Pango markup
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

  const pngBuffer = await sharp(baseBuf).composite(layers).png().toBuffer()

  return new NextResponse(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  })
}
