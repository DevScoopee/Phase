import { type NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { fetchCollectionInfo, extractIpfsGatewaySubpath } from "@/lib/phase-protocol"
import { publicPhaseSiteBaseUrl } from "@/lib/phase-nft-metadata-build"

export const runtime = "nodejs"

const OG_W = 1200
const OG_H = 630

// NFT image position — calibrated to fit inside the purple neon frame (inner content only).
// Frame is narrow and slightly left-of-center in the OG output.
const NFT_LEFT   = 532
const NFT_TOP    = 152
const NFT_WIDTH  = 140
const NFT_HEIGHT = 155

// Collection name text position (centered, below the image frame)
const TEXT_Y = 355

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

function nameSvg(name: string): Buffer {
  const escaped = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
    <text
      x="${OG_W / 2}"
      y="${TEXT_Y}"
      text-anchor="middle"
      font-family="monospace"
      font-size="30"
      font-weight="bold"
      letter-spacing="3"
      fill="white"
      opacity="0.92"
    >${escaped}</text>
  </svg>`
  return Buffer.from(svg)
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
      layers.push({ input: nameSvg(collectionName), top: 0, left: 0 })
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
