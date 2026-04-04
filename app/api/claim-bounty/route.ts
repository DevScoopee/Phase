import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

type ClaimBountyRequest = {
  walletAddress?: string
  userAddress?: string
  reward?: string
}

type ClaimBountySuccessResponse = {
  ok: true
  reward: string
  amountStroops: string
  hash?: string
}

type ClaimBountyPendingResponse = {
  ok?: false
  pending: true
  note?: string
  hash?: string
  amountStroops?: string
}

type ClaimBountyErrorResponse = {
  error: string
  reward?: string
  claimedAt?: number | null
  nextAt?: number | null
  requirementMet?: boolean
  progressPct?: number
  detail?: string
}

type ClaimBountyResponse =
  | ClaimBountySuccessResponse
  | ClaimBountyPendingResponse
  | ClaimBountyErrorResponse

export async function POST(request: NextRequest): Promise<NextResponse<ClaimBountyResponse>> {
  let body: ClaimBountyRequest
  try {
    body = (await request.json()) as ClaimBountyRequest
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
  }

  const payload: ClaimBountyRequest = {
    walletAddress: typeof body.walletAddress === "string" ? body.walletAddress : undefined,
    userAddress: typeof body.userAddress === "string" ? body.userAddress : undefined,
    reward: typeof body.reward === "string" ? body.reward : undefined,
  }

  const upstreamUrl = new URL("/api/faucet", request.url)
  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  })

  const upstreamJson = (await upstream.json().catch(() => ({ error: `HTTP ${upstream.status}` }))) as ClaimBountyResponse
  return NextResponse.json(upstreamJson, { status: upstream.status })
}
