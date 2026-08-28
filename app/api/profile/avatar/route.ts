import { NextRequest } from "next/server"
import { getProfile } from "@/lib/profile-store"
import { StrKey } from "@stellar/stellar-sdk"
import { createApiRequestContext } from "@/lib/api-observability"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const api = createApiRequestContext(request, "/api/profile/avatar")
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim()

  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return api.json(
      { avatar: null },
      { status: 400, event: "profile.avatar.validation_failed", metadata: { reason: "wallet" } },
    )
  }

  try {
    const profile = await getProfile(wallet)

    if (!profile?.avatar_token_id) {
      return api.json({ avatar: null }, { event: "profile.avatar.empty", metadata: { wallet } })
    }

    return api.json(
      {
        avatar: {
          tokenId: profile.avatar_token_id,
          image: profile.avatar_image_url ?? "",
          name: `Phase Artifact #${profile.avatar_token_id}`,
        },
      },
      {
        event: "profile.avatar.loaded",
        metadata: { wallet, token_id: profile.avatar_token_id },
        headers: { "Cache-Control": "private, max-age=30" },
      },
    )
  } catch (error) {
    return api.errorJson(error, 500, "profile.avatar.load_failed")
  }
}