import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { getSignal, createReply } from "@/lib/signal-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ReplyBody = {
  body?: unknown
  wallet?: unknown
  signature?: unknown
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let body: ReplyBody
  try {
    body = (await request.json()) as ReplyBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.wallet !== "string" || !StrKey.isValidEd25519PublicKey(body.wallet)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 })
  }
  if (typeof body.signature !== "string" || body.signature.length === 0) {
    return NextResponse.json({ error: "Signature required" }, { status: 400 })
  }
  if (typeof body.body !== "string" || body.body.trim().length === 0) {
    return NextResponse.json({ error: "Body required" }, { status: 400 })
  }
  if (body.body.trim().length > 500) {
    return NextResponse.json({ error: "Body max 500 chars" }, { status: 400 })
  }

  const signal = await getSignal(id)
  if (!signal) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 })
  }

  const walletStr = body.wallet
  const res = await fetch(
    `${request.nextUrl.origin}/api/artist-profile?walletAddress=${encodeURIComponent(walletStr)}`,
  ).catch(() => null)
  let author_display = `${walletStr.slice(0, 4)}…${walletStr.slice(-4)}`
  if (res?.ok) {
    const data = (await res.json().catch(() => ({}))) as { alias?: string | null }
    if (typeof data.alias === "string" && data.alias.trim().length > 0) {
      author_display = data.alias.trim()
    }
  }

  const reply = await createReply({
    signal_id: id,
    author_wallet: walletStr,
    author_display,
    body: (body.body as string).trim(),
    upvotes: [],
    signature: body.signature as string,
  })

  return NextResponse.json({ reply }, { status: 201 })
}
