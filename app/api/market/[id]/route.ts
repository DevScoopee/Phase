import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { getListing, cancelListing } from "@/lib/market-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 })
  return NextResponse.json({ listing })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const walletParam = request.nextUrl.searchParams.get("wallet")?.trim() ?? ""
  if (!walletParam || !StrKey.isValidEd25519PublicKey(walletParam)) {
    return NextResponse.json({ error: "valid wallet required" }, { status: 400 })
  }
  const listing = await getListing(id)
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 })
  if (listing.seller_wallet !== walletParam) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (listing.status !== "active") {
    return NextResponse.json({ error: "Listing not active" }, { status: 409 })
  }
  const updated = await cancelListing(id)
  return NextResponse.json({ ok: true, listing: updated })
}
