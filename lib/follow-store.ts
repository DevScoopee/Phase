import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { isFeatureEnabled, flagRollbackNote } from "@/lib/feature-flags"
import { serverDataJsonPath } from "@/lib/server-data-paths"
import { HORIZON_URL } from "@/lib/phase-protocol"

export type FollowEntry = {
  following: string[]   // wallets this address follows
  followers: string[]   // wallets following this address
}

export type FollowStore = Record<string, FollowEntry>

export const FollowSuggestionQuerySchema = z.object({
  wallet: z.string().trim().regex(/^G[A-Z2-7]{55}$/, "Invalid wallet"),
  limit: z.coerce.number().int().min(1).max(25).default(8),
})

export type OnChainNeighbor = {
  wallet: string
  sharedAssets: number
}

export type FollowSuggestion = {
  wallet: string
  displayName?: string
  score: number
  mutualFollows: number
  sharedAssets: number
  followerCount: number
}

type HorizonAssetBalance = {
  asset_type?: string
  asset_code?: string
  asset_issuer?: string
}

type HorizonAccountPage = {
  _embedded?: { records?: Array<{ account_id?: string }> }
}

const UriSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => /^https:\/\//i.test(value) || /^ipfs:\/\/[A-Za-z0-9._/-]+$/i.test(value), {
    message: "URI must be https:// or ipfs://",
  })

export const Sep50MetadataAttributeSchema = z.object({
  trait_type: z.string().trim().min(1).max(64),
  value: z.union([z.string().trim().min(1).max(256), z.number().finite()]),
  display_type: z.enum(["number"]).optional(),
})

export const Sep50MetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    description: z.string().trim().min(1).max(1000),
    image: UriSchema,
    external_url: UriSchema.optional(),
    attributes: z.array(Sep50MetadataAttributeSchema).max(64).default([]),
    collectionId: z.number().int().positive().nullable().optional(),
  })
  .strict()

export type Sep50Metadata = z.infer<typeof Sep50MetadataSchema>

export class FollowStoreValidationError extends Error {
  code: "FLAG_DISABLED" | "SEP50_METADATA_INVALID"
  details?: unknown

  constructor(code: FollowStoreValidationError["code"], message: string, details?: unknown) {
    super(message)
    this.name = "FollowStoreValidationError"
    this.code = code
    this.details = details
  }
}

export function isPhase118Enabled(): boolean {
  return isFeatureEnabled("phase-118")
}

export function phase118RollbackNote(): string {
  return flagRollbackNote("phase-118")
}

export function validateSep50MetadataBeforePin(input: unknown, opts: { force?: boolean } = {}):
  | { ok: true; metadata: Sep50Metadata }
  | { ok: false; error: FollowStoreValidationError } {
  if (!opts.force && !isPhase118Enabled()) {
    return {
      ok: false,
      error: new FollowStoreValidationError("FLAG_DISABLED", "phase-118 flag disabled", {
        rollback: phase118RollbackNote(),
      }),
    }
  }

  const parsed = Sep50MetadataSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: new FollowStoreValidationError(
        "SEP50_METADATA_INVALID",
        "Metadata does not satisfy SEP-50-compatible JSON requirements",
        parsed.error.flatten(),
      ),
    }
  }

  return { ok: true, metadata: parsed.data }
}

async function readStore(): Promise<FollowStore> {
  try {
    return JSON.parse(await readFile(serverDataJsonPath("profileFollows"), "utf8")) as FollowStore
  } catch {
    return {}
  }
}

async function writeStore(data: FollowStore): Promise<void> {
  const filePath = serverDataJsonPath("profileFollows")
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

function ensureEntry(store: FollowStore, wallet: string): FollowEntry {
  if (!store[wallet]) store[wallet] = { following: [], followers: [] }
  return store[wallet]
}

export async function followUser(fromWallet: string, toWallet: string): Promise<void> {
  if (fromWallet === toWallet) return
  const store = await readStore()
  const from = ensureEntry(store, fromWallet)
  const to = ensureEntry(store, toWallet)
  if (!from.following.includes(toWallet)) from.following.push(toWallet)
  if (!to.followers.includes(fromWallet)) to.followers.push(fromWallet)
  await writeStore(store)
}

export async function unfollowUser(fromWallet: string, toWallet: string): Promise<void> {
  const store = await readStore()
  const from = ensureEntry(store, fromWallet)
  const to = ensureEntry(store, toWallet)
  from.following = from.following.filter((w) => w !== toWallet)
  to.followers = to.followers.filter((w) => w !== fromWallet)
  await writeStore(store)
}

export async function getFollowers(wallet: string): Promise<string[]> {
  const store = await readStore()
  return store[wallet]?.followers ?? []
}

export async function getFollowing(wallet: string): Promise<string[]> {
  const store = await readStore()
  return store[wallet]?.following ?? []
}

export async function getFollowCounts(wallet: string): Promise<{ followers: number; following: number }> {
  const store = await readStore()
  return {
    followers: store[wallet]?.followers.length ?? 0,
    following: store[wallet]?.following.length ?? 0,
  }
}

export async function isFollowing(fromWallet: string, toWallet: string): Promise<boolean> {
  const store = await readStore()
  return store[fromWallet]?.following.includes(toWallet) ?? false
}

/**
 * Deterministically ranks candidates from the social graph and Stellar
 * trustline co-membership graph. Existing follows and the viewer are excluded.
 */
export function rankFollowSuggestions(
  viewer: string,
  store: FollowStore,
  onChainNeighbors: OnChainNeighbor[],
  limit = 8,
): FollowSuggestion[] {
  const following = new Set(store[viewer]?.following ?? [])
  const candidates = new Map<string, { mutualFollows: number; sharedAssets: number }>()

  for (const followedWallet of following) {
    for (const candidate of store[followedWallet]?.following ?? []) {
      if (candidate === viewer || following.has(candidate)) continue
      const current = candidates.get(candidate) ?? { mutualFollows: 0, sharedAssets: 0 }
      current.mutualFollows += 1
      candidates.set(candidate, current)
    }
  }

  for (const neighbor of onChainNeighbors) {
    if (neighbor.wallet === viewer || following.has(neighbor.wallet)) continue
    const current = candidates.get(neighbor.wallet) ?? { mutualFollows: 0, sharedAssets: 0 }
    current.sharedAssets = Math.max(current.sharedAssets, neighbor.sharedAssets)
    candidates.set(neighbor.wallet, current)
  }

  return [...candidates.entries()]
    .map(([wallet, evidence]) => {
      const followerCount = store[wallet]?.followers.length ?? 0
      return {
        wallet,
        mutualFollows: evidence.mutualFollows,
        sharedAssets: evidence.sharedAssets,
        followerCount,
        score: evidence.mutualFollows * 5 + evidence.sharedAssets * 3 + Math.min(followerCount, 10),
      }
    })
    .sort((a, b) => b.score - a.score || b.mutualFollows - a.mutualFollows || a.wallet.localeCompare(b.wallet))
    .slice(0, limit)
}

/**
 * Reads a bounded Stellar testnet neighborhood by finding accounts that share
 * the viewer's first few non-native trustlines. Failures degrade to the local
 * social graph so suggestions never make profile pages unavailable.
 */
export async function getOnChainNeighbors(wallet: string): Promise<OnChainNeighbor[]> {
  try {
    const accountRes = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(wallet)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (!accountRes.ok) return []
    const account = (await accountRes.json()) as { balances?: HorizonAssetBalance[] }
    const assets = (account.balances ?? [])
      .filter((balance) => balance.asset_type !== "native" && balance.asset_code && balance.asset_issuer)
      .slice(0, 4)

    const counts = new Map<string, number>()
    await Promise.all(assets.map(async (asset) => {
      const assetId = `${asset.asset_code}:${asset.asset_issuer}`
      const res = await fetch(`${HORIZON_URL}/accounts?asset=${encodeURIComponent(assetId)}&limit=40`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
      if (!res.ok) return
      const page = (await res.json()) as HorizonAccountPage
      for (const record of page._embedded?.records ?? []) {
        const candidate = record.account_id
        if (!candidate || candidate === wallet) continue
        counts.set(candidate, (counts.get(candidate) ?? 0) + 1)
      }
    }))
    return [...counts].map(([candidate, sharedAssets]) => ({ wallet: candidate, sharedAssets }))
  } catch {
    return []
  }
}

export async function getFollowSuggestions(wallet: string, limit = 8): Promise<FollowSuggestion[]> {
  const [store, onChainNeighbors] = await Promise.all([readStore(), getOnChainNeighbors(wallet)])
  return rankFollowSuggestions(wallet, store, onChainNeighbors, limit)
}
