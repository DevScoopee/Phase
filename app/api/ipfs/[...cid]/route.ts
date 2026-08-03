import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
} as const

const GATEWAYS = [
  "https://w3s.link/ipfs",
  "https://dweb.link/ipfs",
  "https://ipfs.io/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
]

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ cid: string[] }> },
) {
  const { cid } = await context.params
  if (!cid || cid.length === 0) {
    return NextResponse.json({ error: "Missing CID" }, { status: 400, headers: CORS })
  }

  const ipfsPath = cid.join("/")

  for (const base of GATEWAYS) {
    const url = `${base}/${ipfsPath}`
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "*/*" },
      })
      if (!res.ok) continue
      const contentType = res.headers.get("content-type") ?? "application/octet-stream"
      const body = await res.arrayBuffer()
      return new NextResponse(body, {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": contentType,
          "Cache-Control": "public, s-maxage=31536000, immutable",
        },
      })
    } catch {
      // try next gateway
    }
  }

  return NextResponse.json(
    { error: "IPFS content unavailable from all gateways." },
    { status: 502, headers: CORS },
  )
}
