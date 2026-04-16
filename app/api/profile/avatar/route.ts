import { NextRequest, NextResponse } from "next/server"
import { getProfile } from "@/lib/profile-store"
import { StrKey } from "@stellar/stellar-sdk"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim()

  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ avatar: null }, { status: 400 })
  }

  const profile = await getProfile(wallet)

  if (!profile?.avatar_token_id) {
    return NextResponse.json({ avatar: null })
  }

  return NextResponse.json(
    {
      avatar: {
        tokenId: profile.avatar_token_id,
        image: profile.avatar_image_url ?? "",
        name: `Phase Artifact #${profile.avatar_token_id}`,
      },
    },
    {
      headers: { "Cache-Control": "private, max-age=30" },
    },
  )
}
