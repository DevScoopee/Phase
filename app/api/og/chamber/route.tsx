import { type NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { fetchCollectionInfo, extractIpfsGatewaySubpath } from "@/lib/phase-protocol"
import { publicPhaseSiteBaseUrl } from "@/lib/phase-nft-metadata-build"

export const runtime = "nodejs"

const OG_W = 1200
const OG_H = 630

// Black square position in the 2752x1536 CRT template (pixel-analysed):
// x: 963–1787  y: 230–1151
// Scaled to 1200x630 with objectFit:cover (template is 1.79:1, OG is 1.90:1 → scale by width, crop top/bottom):
//   scaleX = 1200/2752 = 0.4359  → height becomes 669px → crop (669-630)/2 = 19.5px top & bottom
//   left  = 963  * 0.4359         = 420px
//   top   = (230 - 19.5) * 0.4359 = 91px   ← corrected for crop
//   width = (1787-963) * 0.4359  = 359px
//   height= (1151-230) * 0.4359  = 401px
const NFT_LEFT   = 420
const NFT_TOP    = 91
const NFT_WIDTH  = 359
const NFT_HEIGHT = 401

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
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
  let composite = sharp(crtBuf).resize(OG_W, OG_H, { fit: "cover", position: "centre" })

  // 2. If we have a collection, fetch the NFT image and composite it into the screen
  if (Number.isFinite(collectionId) && collectionId > 0) {
    try {
      const collection = await fetchCollectionInfo(collectionId)
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
            // Resize NFT to fit the black square, then composite
            const nftResized = await sharp(nftBuf)
              .resize(NFT_WIDTH, NFT_HEIGHT, { fit: "cover", position: "centre" })
              .toBuffer()

            composite = sharp(await composite.toBuffer()).composite([
              { input: nftResized, left: NFT_LEFT, top: NFT_TOP },
            ])
          }
        }
      }
    } catch {
      // Render without NFT overlay
    }
  }

  const png = await composite.png().toBuffer()

  return new NextResponse(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  })
}
