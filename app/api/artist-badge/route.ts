import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import {
  ArtistAttestationError,
  IssueBadgeRequestSchema,
  getVerifiedArtistBadge,
  isPhase94Enabled,
  issueVerifiedArtistBadge,
} from "@/lib/artist-attestation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function statusForCode(code: ArtistAttestationError["code"]): number {
  switch (code) {
    case "FLAG_DISABLED":
      return 403
    case "VALIDATION_FAILED":
      return 400
    case "SIGNATURE_INVALID":
      return 401
    case "ALREADY_ISSUED":
      return 409
    case "NOT_FOUND":
      return 404
    default:
      return 500
  }
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("walletAddress")?.trim() ?? ""
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "walletAddress invalida." }, { status: 400 })
  }
  const badge = await getVerifiedArtistBadge(wallet)
  return NextResponse.json({
    walletAddress: wallet,
    verified: badge != null,
    badge,
    feature_enabled: isPhase94Enabled(),
  })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  const parsed = IssueBadgeRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const badge = await issueVerifiedArtistBadge(parsed.data)
    return NextResponse.json({ ok: true, badge })
  } catch (e) {
    if (e instanceof ArtistAttestationError) {
      return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: statusForCode(e.code) })
    }
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 500 })
  }
}
