import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { followUser, unfollowUser, getFollowCounts, isFollowing } from "@/lib/follow-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim() ?? ""
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 })
  }
  const viewer = request.nextUrl.searchParams.get("viewer")?.trim() ?? ""
  const counts = await getFollowCounts(wallet)
  const viewing = viewer && StrKey.isValidEd25519PublicKey(viewer) && viewer !== wallet
    ? await isFollowing(viewer, wallet)
    : null
  return NextResponse.json({ ...counts, isFollowing: viewing })
}

type FollowBody = {
  from?: unknown
  to?: unknown
  action?: unknown
}

export async function POST(request: NextRequest) {
  let body: FollowBody
  try {
    body = (await request.json()) as FollowBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.from !== "string" || !StrKey.isValidEd25519PublicKey(body.from)) {
    return NextResponse.json({ error: "Invalid from wallet" }, { status: 400 })
  }
  if (typeof body.to !== "string" || !StrKey.isValidEd25519PublicKey(body.to)) {
    return NextResponse.json({ error: "Invalid to wallet" }, { status: 400 })
  }
  if (body.from === body.to) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 })
  }
  if (body.action !== "follow" && body.action !== "unfollow") {
    return NextResponse.json({ error: "action must be follow or unfollow" }, { status: 400 })
  }

  if (body.action === "follow") {
    await followUser(body.from, body.to)
  } else {
    await unfollowUser(body.from, body.to)
  }

  const counts = await getFollowCounts(body.to)
  return NextResponse.json({ ok: true, ...counts })
}
