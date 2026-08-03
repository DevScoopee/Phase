import { NextResponse, type NextRequest } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { buildPhaseTokenMetadataJson } from "@/lib/phase-nft-metadata-build"
import { phaseProtocolContractIdForServer } from "@/lib/phase-protocol"

export const dynamic = "force-dynamic"

const corsJson = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS, HEAD",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
} as const

/** Freighter / wallets pueden hacer preflight antes del GET del JSON de metadata. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsJson })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const tokenId = parseInt(id, 10)
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return NextResponse.json(
      { error: "invalid id" },
      { status: 400, headers: { ...corsJson, "Content-Type": "application/json; charset=utf-8" } },
    )
  }

  const cParam = request.nextUrl.searchParams.get("c")?.trim() ?? ""
  const contractId =
    cParam && StrKey.isValidContract(cParam) ? cParam : phaseProtocolContractIdForServer()
  const payload = await buildPhaseTokenMetadataJson(contractId, tokenId)
  if (!payload) {
    return NextResponse.json(
      { error: "not found" },
      { status: 404, headers: { ...corsJson, "Content-Type": "application/json; charset=utf-8" } },
    )
  }

  return NextResponse.json(
    payload,
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...corsJson,
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  )
}
