import { ImageResponse } from "next/og"
import { type NextRequest } from "next/server"
import { fetchCollectionInfo, extractIpfsGatewaySubpath } from "@/lib/phase-protocol"
import { publicPhaseSiteBaseUrl } from "@/lib/phase-nft-metadata-build"

export const runtime = "edge"

export async function GET(request: NextRequest) {
  const base = publicPhaseSiteBaseUrl()
  const { searchParams } = request.nextUrl
  const rawCollection = searchParams.get("collection")
  const collectionId = rawCollection ? parseInt(rawCollection, 10) : NaN

  // CRT frame template — served from /public
  const crtFrameUrl = `${base}/og-crt-frame.png`
  const fallbackOgUrl = `${base}/og-phase.png`

  // If no valid collection, return the default OG image redirect
  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    return new ImageResponse(
      (
        <img
          src={fallbackOgUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          alt="PHASE Protocol"
        />
      ),
      { width: 1200, height: 630 },
    )
  }

  let nftImageUrl: string | null = null
  try {
    const collection = await fetchCollectionInfo(collectionId)
    if (collection?.imageUri) {
      const uri = collection.imageUri.trim()
      if (/^https?:\/\//i.test(uri)) {
        nftImageUrl = uri
      } else {
        const ipfsPath = extractIpfsGatewaySubpath(uri)
        if (ipfsPath) {
          // Use our own proxy so the edge function can fetch it
          nftImageUrl = `${base}/api/ipfs/${ipfsPath}`
        }
      }
    }
  } catch {
    // fall through — render without NFT overlay
  }

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "1200px",
          height: "630px",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* CRT monitor frame */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={crtFrameUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />

        {/* NFT image composited into the black square on the CRT screen.
            The black region sits at ~35-65% horizontal, ~15-75% vertical
            in the original 2752x1536 template. Scaled to 1200x630 OG:
            - x: 420-780px (left 35%, width 30%)
            - y: 76-454px  (top 12%, height 60%)  [~3% top crop from cover fit] */}
        {nftImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nftImageUrl}
            alt=""
            style={{
              position: "absolute",
              left: "420px",
              top: "76px",
              width: "360px",
              height: "378px",
              objectFit: "cover",
              opacity: 0.9,
            }}
          />
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
}
