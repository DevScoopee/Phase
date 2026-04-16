import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { getAchievements, getWalletData } from "@/lib/achievement-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim() ?? ""
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "valid wallet required" }, { status: 400 })
  }
  const [achievements, data] = await Promise.all([
    getAchievements(wallet),
    getWalletData(wallet),
  ])
  return NextResponse.json({
    achievements,
    counters: {
      mint_count: data.mint_count ?? 0,
      daily_streak: data.daily_streak ?? 0,
      total_upvotes: data.total_upvotes ?? 0,
      follower_count: data.follower_count ?? 0,
      narrator_count: data.narrator_count ?? 0,
    },
  })
}
