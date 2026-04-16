import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { getListings, createListing } from "@/lib/market-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const collectionId = searchParams.get("collection")
  const sellerWallet = searchParams.get("seller")
  const sort = searchParams.get("sort") as "price_asc" | "price_desc" | "newest" | null

  const listings = await getListings({
    collection_id: collectionId ? Number(collectionId) : undefined,
    seller_wallet: sellerWallet ?? undefined,
    sort: sort ?? "newest",
  })
  return NextResponse.json({ listings })
}

type CreateBody = {
  seller_wallet?: unknown
  token_id?: unknown
  collection_id?: unknown
  price_phaselq?: unknown
  accepts_offers?: unknown
  min_offer?: unknown
  image?: unknown
  name?: unknown
}

export async function POST(request: NextRequest) {
  let body: CreateBody
  try { body = (await request.json()) as CreateBody }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const seller_wallet = typeof body.seller_wallet === "string" ? body.seller_wallet.trim() : ""
  if (!seller_wallet || !StrKey.isValidEd25519PublicKey(seller_wallet)) {
    return NextResponse.json({ error: "valid seller_wallet required" }, { status: 400 })
  }

  const token_id = Number(body.token_id)
  const collection_id = Number(body.collection_id)
  const price_phaselq = Number(body.price_phaselq)

  if (!Number.isInteger(token_id) || token_id <= 0)
    return NextResponse.json({ error: "invalid token_id" }, { status: 400 })
  if (!Number.isInteger(collection_id) || collection_id < 0)
    return NextResponse.json({ error: "invalid collection_id" }, { status: 400 })
  if (!Number.isFinite(price_phaselq) || price_phaselq <= 0)
    return NextResponse.json({ error: "price_phaselq must be positive" }, { status: 400 })

  const min_offer = typeof body.min_offer === "number" ? body.min_offer : undefined
  const listing = await createListing({
    token_id,
    collection_id,
    seller_wallet,
    price_phaselq,
    accepts_offers: body.accepts_offers === true,
    min_offer,
    image: typeof body.image === "string" ? body.image : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
  })
  return NextResponse.json({ listing }, { status: 201 })
}
