import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { serverDataJsonPath } from "@/lib/server-data-paths"

export type NarratorTone = "enigmatic" | "epic" | "scientific" | "folkloric"

export type WorldCollectionData = {
  world_name: string
  world_prompt: string
  created_at: number
  narrator_tone?: NarratorTone
}

export type WorldNarrativeData = {
  narrative: string
  collection_id: number
  lore_input: string
  generated_at: number
}

type WorldCollectionsStore = Record<string, WorldCollectionData>
type WorldNarrativesStore = Record<string, WorldNarrativeData>

async function readJsonStore<T extends object>(filePath: string): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8")
    return JSON.parse(raw) as T
  } catch {
    return {} as T
  }
}

async function writeJsonStore<T extends object>(filePath: string, data: T): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

export async function getWorldForCollection(collectionId: number): Promise<WorldCollectionData | null> {
  const store = await readJsonStore<WorldCollectionsStore>(
    serverDataJsonPath("worldCollections"),
  )
  return store[String(collectionId)] ?? null
}

export async function saveWorldForCollection(
  collectionId: number,
  data: Pick<WorldCollectionData, "world_name" | "world_prompt" | "narrator_tone">,
): Promise<void> {
  const filePath = serverDataJsonPath("worldCollections")
  const store = await readJsonStore<WorldCollectionsStore>(filePath)
  const existing = store[String(collectionId)]
  store[String(collectionId)] = {
    ...existing,
    world_name: data.world_name,
    world_prompt: data.world_prompt,
    ...(data.narrator_tone !== undefined ? { narrator_tone: data.narrator_tone } : {}),
    created_at: existing?.created_at ?? Date.now(),
  }
  await writeJsonStore(filePath, store)
}

export async function getAllWorldCollections(): Promise<WorldCollectionsStore> {
  return readJsonStore<WorldCollectionsStore>(serverDataJsonPath("worldCollections"))
}

export async function getNarrativeForToken(tokenId: number): Promise<WorldNarrativeData | null> {
  const store = await readJsonStore<WorldNarrativesStore>(
    serverDataJsonPath("worldNarratives"),
  )
  return store[String(tokenId)] ?? null
}

export async function saveNarrativeForToken(
  tokenId: number,
  data: Omit<WorldNarrativeData, "generated_at">,
): Promise<void> {
  const filePath = serverDataJsonPath("worldNarratives")
  const store = await readJsonStore<WorldNarrativesStore>(filePath)
  store[String(tokenId)] = { ...data, generated_at: Date.now() }
  await writeJsonStore(filePath, store)
}

/** Returns the total count of distinct token narratives across all world collections. */
export async function getAllNarrativesCount(): Promise<number> {
  const store = await readJsonStore<WorldNarrativesStore>(serverDataJsonPath("worldNarratives"))
  return Object.keys(store).length
}

type NftListingsFile = {
  listings?: Array<{ tokenId?: number; seller?: string }>
}

/**
 * Counts unique wallets (sellers) that own tokens with narratives in the given
 * active-world collection IDs. Falls back to unique-token count when no listing
 * data is available for a token.
 */
export async function countCollectorsInWorlds(worldCollectionIds: number[]): Promise<number> {
  if (worldCollectionIds.length === 0) return 0
  const activeSet = new Set(worldCollectionIds)

  const narratives = await readJsonStore<WorldNarrativesStore>(serverDataJsonPath("worldNarratives"))
  const tokenIdsWithNarratives = new Set<number>()
  for (const [tokenId, data] of Object.entries(narratives)) {
    if (activeSet.has(data.collection_id)) tokenIdsWithNarratives.add(Number(tokenId))
  }
  if (tokenIdsWithNarratives.size === 0) return 0

  // Cross-reference with nft-listings to resolve wallets
  const listingsFile = await readJsonStore<NftListingsFile>(serverDataJsonPath("nftListings"))
  const tokenToWallet = new Map<number, string>()
  for (const listing of listingsFile.listings ?? []) {
    if (typeof listing.tokenId === "number" && typeof listing.seller === "string") {
      tokenToWallet.set(listing.tokenId, listing.seller)
    }
  }

  const uniqueWallets = new Set<string>()
  let unknownCount = 0
  for (const tokenId of tokenIdsWithNarratives) {
    const wallet = tokenToWallet.get(tokenId)
    if (wallet) uniqueWallets.add(wallet)
    else unknownCount++
  }

  // If some tokens have no listing data, count them as 1 additional wallet each
  return uniqueWallets.size + unknownCount
}

/** Returns narratives for a collection sorted newest-first, up to `limit`. */
export async function getRecentNarrativesForCollection(
  collectionId: number,
  limit: number,
): Promise<WorldNarrativeData[]> {
  const store = await readJsonStore<WorldNarrativesStore>(serverDataJsonPath("worldNarratives"))
  return Object.values(store)
    .filter((v) => v.collection_id === collectionId)
    .sort((a, b) => b.generated_at - a.generated_at)
    .slice(0, limit)
}
