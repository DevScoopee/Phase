import { NextRequest, NextResponse } from "next/server"
import { fetchTokenOwnerAddress, phaseProtocolContractIdForServer } from "@/lib/phase-protocol"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PHASE_PROTOCOL_CONTRACT = phaseProtocolContractIdForServer()

type Body = {
  tokenId?: number | string
  walletAddress?: string
}

/**
 * Comprueba que el utility NFT existe en ledger (`owner_of`).
 * Devuelve `viewerIsOwner` si se pasó `walletAddress`; el cliente usa eso para ocultar Collect cuando ya es dueño.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 })
  }

  const rawId = body.tokenId
  const tokenId = typeof rawId === "number" ? rawId : Number.parseInt(String(rawId ?? ""), 10)
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid tokenId." }, { status: 400 })
  }

  const wallet = typeof body.walletAddress === "string" ? body.walletAddress.trim() : ""
  const owner = await fetchTokenOwnerAddress(PHASE_PROTOCOL_CONTRACT, Math.floor(tokenId))

  if (!owner) {
    return NextResponse.json(
      {
        ok: false,
        code: "NFT_NOT_MINTED",
        detail:
          "No on-chain owner for this token id. The NFT was not minted (e.g. mint tx failed) or the id does not exist on this contract.",
        contractId: PHASE_PROTOCOL_CONTRACT,
        tokenId: Math.floor(tokenId),
      },
      { status: 404 },
    )
  }

  const viewerIsOwner = wallet.length > 0 && owner.toUpperCase() === wallet.toUpperCase()

  return NextResponse.json({
    ok: true,
    owner,
    viewerIsOwner,
    contractId: PHASE_PROTOCOL_CONTRACT,
    tokenId: Math.floor(tokenId),
  })
}
