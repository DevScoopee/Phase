import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { serverDataJsonPath } from "@/lib/server-data-paths"

export type ListingStatus = "active" | "sold" | "cancelled"
export type OfferStatus = "pending" | "accepted" | "rejected" | "expired"

export type Listing = {
  id: string
  token_id: number
  collection_id: number
  seller_wallet: string
  price_phaselq: number
  accepts_offers: boolean
  min_offer?: number
  image?: string
  name?: string
  listed_at: number
  status: ListingStatus
}

export type Offer = {
  id: string
  listing_id: string
  buyer_wallet: string
  amount_phaselq: number
  message?: string
  created_at: number
  status: OfferStatus
  expires_at: number
}

type ListingsStore = Record<string, Listing>
type OffersStore = Record<string, Offer>

const OFFER_TTL_MS = 48 * 60 * 60 * 1000 // 48h

async function readJson<T extends object>(filePath: string): Promise<T> {
  try { return JSON.parse(await readFile(filePath, "utf8")) as T }
  catch { return {} as T }
}

async function writeJson<T extends object>(filePath: string, data: T): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

// ── Listings ──────────────────────────────────────────────────────────────────

export async function getListing(id: string): Promise<Listing | null> {
  const store = await readJson<ListingsStore>(serverDataJsonPath("marketListings"))
  return store[id] ?? null
}

export type ListingFilters = {
  collection_id?: number
  seller_wallet?: string
  sort?: "price_asc" | "price_desc" | "newest"
  status?: ListingStatus
}

export async function getListings(filters?: ListingFilters): Promise<Listing[]> {
  const store = await readJson<ListingsStore>(serverDataJsonPath("marketListings"))
  let list = Object.values(store)

  const status = filters?.status ?? "active"
  list = list.filter((l) => l.status === status)
  if (filters?.collection_id !== undefined)
    list = list.filter((l) => l.collection_id === filters.collection_id)
  if (filters?.seller_wallet)
    list = list.filter((l) => l.seller_wallet === filters.seller_wallet)

  const sort = filters?.sort ?? "newest"
  if (sort === "price_asc") list.sort((a, b) => a.price_phaselq - b.price_phaselq)
  else if (sort === "price_desc") list.sort((a, b) => b.price_phaselq - a.price_phaselq)
  else list.sort((a, b) => b.listed_at - a.listed_at)

  return list
}

export async function createListing(data: Omit<Listing, "id" | "listed_at" | "status">): Promise<Listing> {
  const store = await readJson<ListingsStore>(serverDataJsonPath("marketListings"))
  const listing: Listing = { ...data, id: randomUUID(), listed_at: Date.now(), status: "active" }
  store[listing.id] = listing
  await writeJson(serverDataJsonPath("marketListings"), store)
  return listing
}

export async function cancelListing(id: string): Promise<Listing | null> {
  const store = await readJson<ListingsStore>(serverDataJsonPath("marketListings"))
  const listing = store[id]
  if (!listing) return null
  store[id] = { ...listing, status: "cancelled" }
  await writeJson(serverDataJsonPath("marketListings"), store)
  return store[id]!
}

export async function soldListing(id: string): Promise<Listing | null> {
  const store = await readJson<ListingsStore>(serverDataJsonPath("marketListings"))
  const listing = store[id]
  if (!listing) return null
  store[id] = { ...listing, status: "sold" }
  await writeJson(serverDataJsonPath("marketListings"), store)
  return store[id]!
}

// ── Offers ────────────────────────────────────────────────────────────────────

export async function getOffers(listing_id: string): Promise<Offer[]> {
  const store = await readJson<OffersStore>(serverDataJsonPath("marketOffers"))
  const now = Date.now()
  return Object.values(store)
    .filter((o) => o.listing_id === listing_id)
    .map((o) => {
      if (o.status === "pending" && o.expires_at < now) {
        return { ...o, status: "expired" as OfferStatus }
      }
      return o
    })
    .sort((a, b) => b.created_at - a.created_at)
}

export async function createOffer(data: Omit<Offer, "id" | "created_at" | "status" | "expires_at">): Promise<Offer> {
  const store = await readJson<OffersStore>(serverDataJsonPath("marketOffers"))
  const offer: Offer = {
    ...data,
    id: randomUUID(),
    created_at: Date.now(),
    status: "pending",
    expires_at: Date.now() + OFFER_TTL_MS,
  }
  store[offer.id] = offer
  await writeJson(serverDataJsonPath("marketOffers"), store)
  return offer
}

export async function updateOfferStatus(offer_id: string, status: OfferStatus): Promise<Offer | null> {
  const store = await readJson<OffersStore>(serverDataJsonPath("marketOffers"))
  const offer = store[offer_id]
  if (!offer) return null
  store[offer_id] = { ...offer, status }
  await writeJson(serverDataJsonPath("marketOffers"), store)
  return store[offer_id]!
}

export async function getOffersByBuyer(buyer_wallet: string): Promise<Offer[]> {
  const store = await readJson<OffersStore>(serverDataJsonPath("marketOffers"))
  const now = Date.now()
  return Object.values(store)
    .filter((o) => o.buyer_wallet === buyer_wallet)
    .map((o) => (o.status === "pending" && o.expires_at < now ? { ...o, status: "expired" as OfferStatus } : o))
    .sort((a, b) => b.created_at - a.created_at)
}
