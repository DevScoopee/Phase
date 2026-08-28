import { NextResponse, type NextRequest } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { z } from "zod"
import { buildPhaseTokenMetadataJson, PhaseMetadataRequestSchema } from "@/lib/phase-nft-metadata-build"
import { phaseProtocolContractIdForServer } from "@/lib/phase-protocol"

export const dynamic = "force-dynamic"

// phase-123: feature flag check (rollback: unset NEXT_PUBLIC_FEATURE_PHASE_123)
function isPhase123Enabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_FEATURE_PHASE_123 ?? process.env.FEATURE_PHASE_123 ?? "").trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

const MetadataIdParamSchema = z.coerce.number().int().min(1).max(1_000_000)

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
  const parsedId = MetadataIdParamSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "invalid id", details: parsedId.error.flatten() },
      { status: 400, headers: { ...corsJson, "Content-Type": "application/json; charset=utf-8" } },
    )
  }
  const tokenId = parsedId.data

  const cParam = request.nextUrl.searchParams.get("c")?.trim() ?? ""
  const contractId =
    cParam && StrKey.isValidContract(cParam) ? cParam : phaseProtocolContractIdForServer()

  // phase-123: validate contract+token pair when flag enabled (type-safe, structured error)
  if (isPhase123Enabled()) {
    const chk = PhaseMetadataRequestSchema.safeParse({ contractId, tokenId })
    if (!chk.success) {
      return NextResponse.json(
        { error: "validation failed", details: chk.error.flatten() },
        { status: 400, headers: { ...corsJson, "Content-Type": "application/json; charset=utf-8" } },
      )
    }
  }

  let payload: Awaited<ReturnType<typeof buildPhaseTokenMetadataJson>>
  try {
    payload = await buildPhaseTokenMetadataJson(contractId, tokenId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Structured error handling: don't leak internal, but log with flag context
    if (isPhase123Enabled()) {
      console.warn(`[phase-123] metadata build failed token=${tokenId} contract=${contractId.slice(0, 8)}…: ${msg}`)
    }
    return NextResponse.json(
      { error: "metadata build failed", detail: msg.slice(0, 200) },
      { status: 502, headers: { ...corsJson, "Content-Type": "application/json; charset=utf-8" } },
    )
  }
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
        ...(isPhase123Enabled() ? { "X-Phase-IPFS-Fallback": "enabled" } : {}),
      },
    },
  )
}
