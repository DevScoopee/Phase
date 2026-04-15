import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import {
  getSignals,
  createSignal,
  getSignalChannelStats,
} from "@/lib/signal-store"
import { getAllWorldCollections } from "@/lib/narrative-world-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isValidWallet(w: unknown): w is string {
  return typeof w === "string" && StrKey.isValidEd25519PublicKey(w)
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const channel = sp.get("channel") ?? undefined
  const sort = (sp.get("sort") ?? "hot") as "hot" | "new" | "top"
  const limit = Math.min(Number(sp.get("limit") ?? 20), 100)
  const offset = Number(sp.get("offset") ?? 0)

  const worldStore = await getAllWorldCollections()
  const worldNames: Record<string, string> = {}
  for (const [id, data] of Object.entries(worldStore)) {
    worldNames[id] = data.world_name
  }

  const [all, channels] = await Promise.all([
    getSignals(channel, sort),
    getSignalChannelStats(worldNames),
  ])

  const total = all.length
  const signals = all.slice(offset, offset + limit)

  return NextResponse.json({ signals, total, channels })
}

type CreateSignalBody = {
  title?: unknown
  body?: unknown
  channel?: unknown
  wallet?: unknown
  signature?: unknown
  nft_token_id?: unknown
  nft_collection_id?: unknown
  nft_name?: unknown
  nft_image?: unknown
}

export async function POST(request: NextRequest) {
  let body: CreateSignalBody
  try {
    body = (await request.json()) as CreateSignalBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!isValidWallet(body.wallet)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 })
  }
  if (typeof body.signature !== "string" || body.signature.length === 0) {
    return NextResponse.json({ error: "Signature required" }, { status: 400 })
  }
  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ error: "Title required" }, { status: 400 })
  }
  if (body.title.trim().length > 120) {
    return NextResponse.json({ error: "Title max 120 chars" }, { status: 400 })
  }
  if (typeof body.body !== "string" || body.body.trim().length === 0) {
    return NextResponse.json({ error: "Body required" }, { status: 400 })
  }
  if (body.body.trim().length > 1000) {
    return NextResponse.json({ error: "Body max 1000 chars" }, { status: 400 })
  }
  if (typeof body.channel !== "string" || body.channel.trim().length === 0) {
    return NextResponse.json({ error: "Channel required" }, { status: 400 })
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

  const signal = await createSignal({
    author_wallet: walletStr,
    author_display,
    channel: (body.channel as string).trim(),
    title: body.title.trim(),
    body: (body.body as string).trim(),
    upvotes: [],
    signature: body.signature as string,
    ...(typeof body.nft_token_id === "number" ? { nft_token_id: body.nft_token_id } : {}),
    ...(typeof body.nft_collection_id === "number" ? { nft_collection_id: body.nft_collection_id } : {}),
    ...(typeof body.nft_name === "string" ? { nft_name: body.nft_name } : {}),
    ...(typeof body.nft_image === "string" ? { nft_image: body.nft_image } : {}),
  })

  return NextResponse.json({ signal }, { status: 201 })
}
