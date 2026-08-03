import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { getListing, getOffers, createOffer } from "@/lib/market-store"
import { createNotification } from "@/lib/notification-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const offers = await getOffers(id)
  return NextResponse.json({ offers })
}

type OfferBody = {
  buyer_wallet?: unknown
  amount_phaselq?: unknown
  message?: unknown
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let body: OfferBody
  try { body = (await request.json()) as OfferBody }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const buyer_wallet = typeof body.buyer_wallet === "string" ? body.buyer_wallet.trim() : ""
  if (!buyer_wallet || !StrKey.isValidEd25519PublicKey(buyer_wallet)) {
    return NextResponse.json({ error: "valid buyer_wallet required" }, { status: 400 })
  }

  const amount_phaselq = Number(body.amount_phaselq)
  if (!Number.isFinite(amount_phaselq) || amount_phaselq <= 0) {
    return NextResponse.json({ error: "amount_phaselq must be positive" }, { status: 400 })
  }

  const listing = await getListing(id)
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 })
  if (listing.status !== "active") return NextResponse.json({ error: "Listing not active" }, { status: 409 })
  if (!listing.accepts_offers) return NextResponse.json({ error: "Listing does not accept offers" }, { status: 409 })
  if (listing.min_offer !== undefined && amount_phaselq < listing.min_offer) {
    return NextResponse.json({ error: `Minimum offer is ${listing.min_offer} PHASELQ` }, { status: 400 })
  }
  if (listing.seller_wallet === buyer_wallet) {
    return NextResponse.json({ error: "Cannot offer on your own listing" }, { status: 400 })
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 200) : undefined
  const offer = await createOffer({ listing_id: id, buyer_wallet, amount_phaselq, message })

  // Notify seller (fire-and-forget)
  void createNotification(listing.seller_wallet, "new_offer", {
    listing_id: id,
    token_id: listing.token_id,
    amount: amount_phaselq,
    buyer_wallet,
  }).catch(() => { /* silent */ })

  return NextResponse.json({ offer }, { status: 201 })
}
