import { NextRequest } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { getListing, getOffers, createOffer } from "@/lib/market-store"
import { createNotification } from "@/lib/notification-store"
import { createApiRequestContext } from "@/lib/api-observability"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const api = createApiRequestContext(request, "/api/market/[id]/offers")
  const { id } = await params

  try {
    const offers = await getOffers(id)
    return api.json({ offers }, { event: "market.offers.loaded", metadata: { listing_id: id } })
  } catch (error) {
    return api.errorJson(error, 500, "market.offers.load_failed")
  }
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
  const api = createApiRequestContext(request, "/api/market/[id]/offers")
  const { id } = await params
  let body: OfferBody
  try {
    body = (await request.json()) as OfferBody
  } catch {
    return api.json({ error: "Invalid JSON" }, { status: 400, event: "market.offer.invalid_json" })
  }

  const buyer_wallet = typeof body.buyer_wallet === "string" ? body.buyer_wallet.trim() : ""
  if (!buyer_wallet || !StrKey.isValidEd25519PublicKey(buyer_wallet)) {
    return api.json(
      { error: "valid buyer_wallet required" },
      { status: 400, event: "market.offer.validation_failed", metadata: { reason: "buyer_wallet" } },
    )
  }

  const amount_phaselq = Number(body.amount_phaselq)
  if (!Number.isFinite(amount_phaselq) || amount_phaselq <= 0) {
    return api.json(
      { error: "amount_phaselq must be positive" },
      { status: 400, event: "market.offer.validation_failed", metadata: { reason: "amount_phaselq" } },
    )
  }

  try {
    const listing = await getListing(id)
    if (!listing) return api.json({ error: "Listing not found" }, { status: 404, event: "market.offer.listing_missing", metadata: { listing_id: id } })
    if (listing.status !== "active") return api.json({ error: "Listing not active" }, { status: 409, event: "market.offer.listing_inactive", metadata: { listing_id: id } })
    if (!listing.accepts_offers) return api.json({ error: "Listing does not accept offers" }, { status: 409, event: "market.offer.disabled", metadata: { listing_id: id } })
    if (listing.min_offer !== undefined && amount_phaselq < listing.min_offer) {
      return api.json(
        { error: `Minimum offer is ${listing.min_offer} PHASELQ` },
        { status: 400, event: "market.offer.validation_failed", metadata: { reason: "min_offer", listing_id: id } },
      )
    }
    if (listing.seller_wallet === buyer_wallet) {
      return api.json(
        { error: "Cannot offer on your own listing" },
        { status: 400, event: "market.offer.validation_failed", metadata: { reason: "own_listing", listing_id: id } },
      )
    }

    const message = typeof body.message === "string" ? body.message.trim().slice(0, 200) : undefined
    const offer = await createOffer({ listing_id: id, buyer_wallet, amount_phaselq, message })

    void createNotification(listing.seller_wallet, "new_offer", {
      listing_id: id,
      token_id: listing.token_id,
      amount: amount_phaselq,
      buyer_wallet,
    }).catch((error) => api.log("warn", "market.offer.notification_failed", { error }))

    return api.json(
      { offer },
      { status: 201, event: "market.offer.created", metadata: { listing_id: id, offer_id: offer.id } },
    )
  } catch (error) {
    return api.errorJson(error, 500, "market.offer.create_failed")
  }
}