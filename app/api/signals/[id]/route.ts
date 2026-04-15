import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { getSignal, upvoteSignal, getReplies } from "@/lib/signal-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const signal = await getSignal(id)
  if (!signal) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 })
  }
  const replies = await getReplies(id)
  return NextResponse.json({ signal, replies })
}

type UpvoteBody = {
  wallet?: unknown
  signature?: unknown
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let body: UpvoteBody
  try {
    body = (await request.json()) as UpvoteBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.wallet !== "string" || !StrKey.isValidEd25519PublicKey(body.wallet)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 })
  }
  if (typeof body.signature !== "string" || body.signature.length === 0) {
    return NextResponse.json({ error: "Signature required" }, { status: 400 })
  }

  try {
    const signal = await upvoteSignal(id, body.wallet)
    return NextResponse.json({ signal })
  } catch {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 })
  }
}
