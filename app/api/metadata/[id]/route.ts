import { NextResponse, type NextRequest } from "next/server"
import { buildPhaseTokenMetadataJson } from "@/lib/phase-nft-metadata-build"
import { phaseProtocolContractIdForServer } from "@/lib/phase-protocol"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const tokenId = parseInt(id, 10)
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }

  const contractId = phaseProtocolContractIdForServer()
  const payload = await buildPhaseTokenMetadataJson(contractId, tokenId)
  if (!payload) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  const { name, description, image } = payload

  return NextResponse.json(
    { name, description, image },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  )
}
