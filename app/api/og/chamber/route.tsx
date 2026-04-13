import { ImageResponse } from "next/og"
import { type NextRequest } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fetchCollectionInfo, extractIpfsGatewaySubpath } from "@/lib/phase-protocol"
import { publicPhaseSiteBaseUrl } from "@/lib/phase-nft-metadata-build"

export const runtime = "nodejs"

async function fileToDataUrl(filePath: string): Promise<string> {
  const buf = await readFile(filePath)
  return `data:image/png;base64,${buf.toString("base64")}`
}

async function fetchToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const ct = res.headers.get("content-type") ?? "image/png"
    return `data:${ct};base64,${Buffer.from(buf).toString("base64")}`
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const base = publicPhaseSiteBaseUrl()
  const { searchParams } = request.nextUrl
  const rawCollection = searchParams.get("collection")
  const collectionId = rawCollection ? parseInt(rawCollection, 10) : NaN

  // Read CRT frame from filesystem — avoids Satori HTTP fetch issues
  const crtFramePath = path.join(process.cwd(), "public", "og-crt-frame.png")
  const crtFrameDataUrl = await fileToDataUrl(crtFramePath)

  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    return new ImageResponse(
      // eslint-disable-next-line @next/next/no-img-element
      <img src={crtFrameDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />,
      { width: 1200, height: 630 },
    )
  }

  // Resolve NFT image URL → base64 data URL
  let nftDataUrl: string | null = null
  let collectionName = ""
  try {
    const collection = await fetchCollectionInfo(collectionId)
    collectionName = collection?.name ?? ""
    const uri = collection?.imageUri?.trim() ?? ""
    if (uri) {
      let nftUrl: string | null = null
      if (/^https?:\/\//i.test(uri)) {
        nftUrl = uri
      } else {
        const ipfsPath = extractIpfsGatewaySubpath(uri)
        if (ipfsPath) nftUrl = `${base}/api/ipfs/${ipfsPath}`
      }
      if (nftUrl) nftDataUrl = await fetchToDataUrl(nftUrl)
    }
  } catch {
    // render without NFT overlay
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
          background: "#000",
        }}
      >
        {/* CRT monitor frame */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={crtFrameDataUrl}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />

        {/* NFT composited into the black screen square.
            Black region: x 35-65%, y 15-75% in the 2752x1536 template.
            Scaled to 1200x630 with cover (≈3% vertical crop):
            left=420 top=76 width=360 height=378 */}
        {nftDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nftDataUrl}
            style={{
              position: "absolute",
              left: "420px",
              top: "76px",
              width: "360px",
              height: "378px",
              objectFit: "cover",
            }}
          />
        )}

        {/* Collection name bottom-left, styled as CRT text */}
        {collectionName && (
          <div
            style={{
              position: "absolute",
              bottom: "28px",
              left: "52px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "11px",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "rgba(167,139,250,0.55)",
              }}
            >
              PHASE: COLLECTION PREVIEW
            </span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "13px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(196,181,253,0.80)",
              }}
            >
              {collectionName}
            </span>
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
