import { NextRequest, NextResponse } from "next/server"
import { getProfile } from "@/lib/profile-store"
import { StrKey } from "@stellar/stellar-sdk"

export const dynamic = "force-dynamic"

type NftItem = {
  tokenId: number
  name: string
  image?: string
}

async function fetchWalletNfts(wallet: string): Promise<NftItem[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
    const res = await fetch(
      `${baseUrl}/api/wallet/phase-nfts?address=${encodeURIComponent(wallet)}`,
      { cache: "no-store" }
    )
    if (!res.ok) return []
    const json = (await res.json()) as { items?: NftItem[] }
    return json.items ?? []
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim()

  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json(
      { error: "valid wallet address required" },
      { status: 400 }
    )
  }

  // Get profile to check for selected avatar_token_id
  const profile = await getProfile(wallet)
  const nfts = await fetchWalletNfts(wallet)

  // If user has selected a specific avatar_token_id, use that
  if (profile?.avatar_token_id !== undefined) {
    const selected = nfts.find((n) => n.tokenId === profile.avatar_token_id)
    if (selected) {
      return NextResponse.json(
        { avatar: selected },
        {
          headers: {
            "Cache-Control": "public, max-age=60",
          },
        }
      )
    }
  }

  // Otherwise, use the first NFT as default avatar
  if (nfts.length > 0) {
    return NextResponse.json(
      { avatar: nfts[0] },
      {
        headers: {
          "Cache-Control": "public, max-age=60",
        },
      }
    )
  }

  // No NFTs found
  return NextResponse.json(
    { avatar: null },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    }
  )
}
