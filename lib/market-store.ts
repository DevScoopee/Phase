import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { StrKey } from "@stellar/stellar-sdk"
import { z } from "zod"
import { isFeatureEnabled, flagRollbackNote } from "@/lib/feature-flags"
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
type ProfileViewAnalyticsStore = Record<string, CreatorProfileViewAnalytics>

const OFFER_TTL_MS = 48 * 60 * 60 * 1000 // 48h

export const ProfileViewEventSchema = z.object({
  creator_wallet: z.string().trim().refine((value) => StrKey.isValidEd25519PublicKey(value), "valid creator wallet required"),
  viewer_wallet: z.string().trim().refine((value) => StrKey.isValidEd25519PublicKey(value), "valid viewer wallet required").optional(),
  source: z.enum(["profile", "market", "dashboard"]).default("profile"),
})

export type ProfileViewEvent = z.infer<typeof ProfileViewEventSchema>

export type CreatorProfileViewAnalytics = {
  creator_wallet: string
  total_views: number
  unique_viewers: number
  last_viewed_at: number
  sources: Partial<Record<ProfileViewEvent["source"], number>>
  viewer_hashes: string[]
}

export class MarketStoreValidationError extends Error {
  code: "FLAG_DISABLED" | "VALIDATION_FAILED"
  details?: unknown

  constructor(code: MarketStoreValidationError["code"], message: string, details?: unknown) {
    super(message)
    this.name = "MarketStoreValidationError"
    this.code = code
    this.details = details
  }
}

export function isPhase100Enabled(): boolean {
  return isFeatureEnabled("phase-100")
}

export function phase100RollbackNote(): string {
  return flagRollbackNote("phase-100")
}

async function readJson<T extends object>(filePath: string): Promise<T> {
  try { return JSON.parse(await readFile(filePath, "utf8")) as T }
  catch { return {} as T }
}

async function writeJson<T extends object>(filePath: string, data: T): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

function viewerAnalyticsKey(viewerWallet?: string): string | null {
  if (!viewerWallet) return null
  return createHash("sha256").update(viewerWallet.toUpperCase(), "utf8").digest("hex")
}

export async function recordCreatorProfileView(input: unknown, opts: { force?: boolean; now?: number } = {}): Promise<CreatorProfileViewAnalytics> {
  if (!opts.force && !isPhase100Enabled()) {
    throw new MarketStoreValidationError("FLAG_DISABLED", "phase-100 flag disabled", {
      rollback: phase100RollbackNote(),
    })
  }

  const parsed = ProfileViewEventSchema.safeParse(input)
  if (!parsed.success) {
    throw new MarketStoreValidationError("VALIDATION_FAILED", "valid profile view payload required", parsed.error.flatten())
  }

  const event = parsed.data
  const now = opts.now ?? Date.now()
  const store = await readJson<ProfileViewAnalyticsStore>(serverDataJsonPath("marketProfileViews"))
  const current = store[event.creator_wallet] ?? {
    creator_wallet: event.creator_wallet,
    total_views: 0,
    unique_viewers: 0,
    last_viewed_at: 0,
    sources: {},
    viewer_hashes: [],
  }

  const viewerKey = viewerAnalyticsKey(event.viewer_wallet)
  const viewerHashes = viewerKey && !current.viewer_hashes.includes(viewerKey)
    ? [...current.viewer_hashes, viewerKey]
    : current.viewer_hashes

  const next: CreatorProfileViewAnalytics = {
    ...current,
    total_views: current.total_views + 1,
    unique_viewers: viewerHashes.length,
    last_viewed_at: now,
    sources: {
      ...current.sources,
      [event.source]: (current.sources[event.source] ?? 0) + 1,
    },
    viewer_hashes: viewerHashes,
  }

  store[event.creator_wallet] = next
  await writeJson(serverDataJsonPath("marketProfileViews"), store)
  return next
}

export async function getCreatorProfileViewAnalytics(creatorWallet: string): Promise<CreatorProfileViewAnalytics | null> {
  const store = await readJson<ProfileViewAnalyticsStore>(serverDataJsonPath("marketProfileViews"))
  return store[creatorWallet] ?? null
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
