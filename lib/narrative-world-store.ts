import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { serverDataJsonPath } from "@/lib/server-data-paths"

export type NarratorTone = "enigmatic" | "epic" | "scientific" | "folkloric"

export type WorldCollectionData = {
  world_name: string
  world_prompt: string
  created_at: number
  narrator_tone?: NarratorTone
  creator_wallet?: string
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
  data: Pick<WorldCollectionData, "world_name" | "world_prompt" | "narrator_tone"> & {
    creator_wallet?: string
  },
): Promise<void> {
  const filePath = serverDataJsonPath("worldCollections")
  const store = await readJsonStore<WorldCollectionsStore>(filePath)
  const existing = store[String(collectionId)]
  store[String(collectionId)] = {
    ...existing,
    world_name: data.world_name,
    world_prompt: data.world_prompt,
    ...(data.narrator_tone !== undefined ? { narrator_tone: data.narrator_tone } : {}),
    ...(data.creator_wallet !== undefined ? { creator_wallet: data.creator_wallet } : {}),
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

// ─── phase-115: cross-artifact lore linking with back-references ────────────
//
// Spike scope: a narrative (artifact) can reference another narrative in the
// same world as connected lore. Links are stored once and resolved in both
// directions — `getLoreLinksForToken` returns what an artifact links to
// (outgoing) and what links to it (back-references / incoming).

export type LoreLink = {
  from_token_id: number
  to_token_id: number
  note?: string
  created_at: number
}

type WorldLoreLinksStore = Record<string, LoreLink[]>

function loreLinkKey(link: Pick<LoreLink, "from_token_id" | "to_token_id">): string {
  return `${link.from_token_id}:${link.to_token_id}`
}

/**
 * Records a directed lore link from one artifact to another. Both tokens
 * must already have narratives in the same world; self-links are rejected.
 * Idempotent — re-adding an existing link only updates its note.
 */
export async function addLoreLink(
  fromTokenId: number,
  toTokenId: number,
  note?: string,
): Promise<LoreLink> {
  if (fromTokenId === toTokenId) {
    throw new Error("An artifact cannot link to itself")
  }
  const [fromNarrative, toNarrative] = await Promise.all([
    getNarrativeForToken(fromTokenId),
    getNarrativeForToken(toTokenId),
  ])
  if (!fromNarrative || !toNarrative) {
    throw new Error("Both artifacts must have a narrative before they can be linked")
  }
  if (fromNarrative.collection_id !== toNarrative.collection_id) {
    throw new Error("Lore links can only connect artifacts within the same world")
  }

  const filePath = serverDataJsonPath("worldLoreLinks")
  const store = await readJsonStore<WorldLoreLinksStore>(filePath)
  const worldKey = String(fromNarrative.collection_id)
  const links = store[worldKey] ?? []
  const link: LoreLink = { from_token_id: fromTokenId, to_token_id: toTokenId, note, created_at: Date.now() }
  const existingIndex = links.findIndex((l) => loreLinkKey(l) === loreLinkKey(link))
  if (existingIndex >= 0) {
    links[existingIndex] = { ...links[existingIndex], note: note ?? links[existingIndex]!.note }
  } else {
    links.push(link)
  }
  store[worldKey] = links
  await writeJsonStore(filePath, store)
  return link
}

/** Returns outgoing links and incoming back-references for a given artifact. */
export async function getLoreLinksForToken(
  tokenId: number,
): Promise<{ outgoing: LoreLink[]; incoming: LoreLink[] }> {
  const narrative = await getNarrativeForToken(tokenId)
  if (!narrative) return { outgoing: [], incoming: [] }

  const store = await readJsonStore<WorldLoreLinksStore>(serverDataJsonPath("worldLoreLinks"))
  const links = store[String(narrative.collection_id)] ?? []
  return {
    outgoing: links.filter((l) => l.from_token_id === tokenId),
    incoming: links.filter((l) => l.to_token_id === tokenId),
  }
}

/** Returns every lore link within a world, for export and back-reference audits. */
export async function getAllLoreLinksForWorld(collectionId: number): Promise<LoreLink[]> {
  const store = await readJsonStore<WorldLoreLinksStore>(serverDataJsonPath("worldLoreLinks"))
  return store[String(collectionId)] ?? []
}

// ─── phase-112: world export to portable markdown and JSON ──────────────────
//
// Spike scope: assemble a world's collection metadata, its narratives, and
// their lore links into one portable snapshot, renderable as JSON or
// markdown so a world can be archived or moved outside PHASE.

export type WorldExportSnapshot = {
  collection_id: number
  world: WorldCollectionData
  narratives: Array<WorldNarrativeData & { token_id: number }>
  lore_links: LoreLink[]
  exported_at: number
}

export async function buildWorldExportSnapshot(collectionId: number): Promise<WorldExportSnapshot | null> {
  const world = await getWorldForCollection(collectionId)
  if (!world) return null

  const store = await readJsonStore<WorldNarrativesStore>(serverDataJsonPath("worldNarratives"))
  const narratives = Object.entries(store)
    .filter(([, data]) => data.collection_id === collectionId)
    .map(([tokenId, data]) => ({ token_id: Number(tokenId), ...data }))
    .sort((a, b) => a.token_id - b.token_id)

  const loreLinks = await getAllLoreLinksForWorld(collectionId)

  return {
    collection_id: collectionId,
    world,
    narratives,
    lore_links: loreLinks,
    exported_at: Date.now(),
  }
}

export function renderWorldExportMarkdown(snapshot: WorldExportSnapshot): string {
  const lines: string[] = []
  lines.push(`# ${snapshot.world.world_name}`)
  lines.push("")
  lines.push(snapshot.world.world_prompt)
  lines.push("")
  lines.push(`_Exported ${new Date(snapshot.exported_at).toISOString()}_`)
  lines.push("")
  for (const narrative of snapshot.narratives) {
    lines.push(`## Artifact #${narrative.token_id}`)
    lines.push("")
    lines.push(narrative.narrative)
    const outgoing = snapshot.lore_links.filter((l) => l.from_token_id === narrative.token_id)
    if (outgoing.length > 0) {
      lines.push("")
      lines.push("**Linked lore:**")
      for (const link of outgoing) {
        lines.push(`- → Artifact #${link.to_token_id}${link.note ? ` — ${link.note}` : ""}`)
      }
    }
    lines.push("")
  }
  return lines.join("\n")
}

// ─── phase-109: collaborative world permissions with role tiers ─────────────
//
// Spike scope: a world has one owner (its creator) who can grant `editor` or
// `viewer` roles to other wallets. Editors may modify world content;
// viewers may only read it. Ungranted wallets have no access record.

export type WorldRole = "owner" | "editor" | "viewer"

type WorldRolesStore = Record<string, Record<string, WorldRole>>

/** Grants the creating wallet the `owner` role for a newly created world. */
export async function ensureWorldOwner(collectionId: number, ownerWallet: string): Promise<void> {
  const filePath = serverDataJsonPath("worldRoles")
  const store = await readJsonStore<WorldRolesStore>(filePath)
  const worldKey = String(collectionId)
  const roles = store[worldKey] ?? {}
  if (!roles[ownerWallet]) {
    roles[ownerWallet] = "owner"
    store[worldKey] = roles
    await writeJsonStore(filePath, store)
  }
}

/**
 * Assigns `role` to `targetWallet` for a world. Only the current owner may
 * assign roles, and ownership itself cannot be reassigned this way.
 */
export async function setWorldRole(
  collectionId: number,
  actingWallet: string,
  targetWallet: string,
  role: "editor" | "viewer",
): Promise<Record<string, WorldRole>> {
  const filePath = serverDataJsonPath("worldRoles")
  const store = await readJsonStore<WorldRolesStore>(filePath)
  const worldKey = String(collectionId)
  const roles = store[worldKey] ?? {}

  if (roles[actingWallet] !== "owner") {
    throw new Error("Only the world owner can assign roles")
  }
  if (roles[targetWallet] === "owner") {
    throw new Error("Ownership cannot be reassigned")
  }

  roles[targetWallet] = role
  store[worldKey] = roles
  await writeJsonStore(filePath, store)
  return roles
}

export async function getWorldRoles(collectionId: number): Promise<Record<string, WorldRole>> {
  const store = await readJsonStore<WorldRolesStore>(serverDataJsonPath("worldRoles"))
  return store[String(collectionId)] ?? {}
}

export async function getWorldRoleForWallet(collectionId: number, wallet: string): Promise<WorldRole | null> {
  const roles = await getWorldRoles(collectionId)
  return roles[wallet] ?? null
}

/** Owners and editors can modify world content; viewers and strangers cannot. */
export async function canEditWorld(collectionId: number, wallet: string): Promise<boolean> {
  const role = await getWorldRoleForWallet(collectionId, wallet)
  return role === "owner" || role === "editor"
}

// ─── phase-108: reader-progression tracking for narrative worlds ────────────
//
// Spike scope: record, per wallet, which artifact narratives in a world have
// been read, so worlds can surface "N of M artifacts read" progress.

type WorldReaderProgressStore = Record<string, Record<string, number[]>>

/** Marks an artifact's narrative as read by `wallet`. Idempotent. */
export async function markNarrativeRead(
  wallet: string,
  collectionId: number,
  tokenId: number,
): Promise<void> {
  const filePath = serverDataJsonPath("worldReaderProgress")
  const store = await readJsonStore<WorldReaderProgressStore>(filePath)
  const worldKey = String(collectionId)
  const worldProgress = store[worldKey] ?? {}
  const readTokenIds = worldProgress[wallet] ?? []
  if (!readTokenIds.includes(tokenId)) {
    readTokenIds.push(tokenId)
    worldProgress[wallet] = readTokenIds
    store[worldKey] = worldProgress
    await writeJsonStore(filePath, store)
  }
}

export type ReaderProgress = {
  read_token_ids: number[]
  read_count: number
  total_narratives: number
}

/** Returns a wallet's read progress against a world's total narrative count. */
export async function getReaderProgress(wallet: string, collectionId: number): Promise<ReaderProgress> {
  const store = await readJsonStore<WorldReaderProgressStore>(serverDataJsonPath("worldReaderProgress"))
  const readTokenIds = store[String(collectionId)]?.[wallet] ?? []
  const totalNarratives = (await getRecentNarrativesForCollection(collectionId, Number.MAX_SAFE_INTEGER)).length
  return {
    read_token_ids: readTokenIds,
    read_count: readTokenIds.length,
    total_narratives: totalNarratives,
  }
}
