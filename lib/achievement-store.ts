import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { serverDataJsonPath } from "@/lib/server-data-paths"
import { createNotification } from "@/lib/notification-store"

export type AchievementId =
  | "first_mint"
  | "collector_5"
  | "collector_10"
  | "first_collection"
  | "world_builder"
  | "narrator_10"
  | "signal_pioneer"
  | "community_voice"
  | "connector_10"
  | "daily_streak_7"
  | "daily_streak_30"
  | "phaselq_100"

export type Achievement = {
  id: AchievementId
  unlocked_at: number
  tx_evidence?: string
}

type WalletAchievements = {
  unlocked: Achievement[]
  // counters for progress tracking
  mint_count?: number
  daily_streak?: number
  last_daily?: number
  total_upvotes?: number
  follower_count?: number
  narrator_count?: number
}

type AchievementStore = Record<string, WalletAchievements>

const ACHIEVEMENT_NAMES: Record<AchievementId, string> = {
  first_mint:      "First Artifact",
  collector_5:     "Collector ×5",
  collector_10:    "Collector ×10",
  first_collection: "Forge Master",
  world_builder:   "World Builder",
  narrator_10:     "Narrator ×10",
  signal_pioneer:  "Signal Pioneer",
  community_voice: "Community Voice",
  connector_10:    "Connector ×10",
  daily_streak_7:  "Streak ×7",
  daily_streak_30: "Streak ×30",
  phaselq_100:     "PHASELQ ×100",
}

async function readStore(): Promise<AchievementStore> {
  try { return JSON.parse(await readFile(serverDataJsonPath("achievements"), "utf8")) as AchievementStore }
  catch { return {} }
}

async function writeStore(data: AchievementStore): Promise<void> {
  const fp = serverDataJsonPath("achievements")
  await mkdir(path.dirname(fp), { recursive: true })
  await writeFile(fp, JSON.stringify(data, null, 2), "utf8")
}

function ensureEntry(store: AchievementStore, wallet: string): WalletAchievements {
  if (!store[wallet]) store[wallet] = { unlocked: [] }
  return store[wallet]!
}

export async function getAchievements(wallet: string): Promise<Achievement[]> {
  const store = await readStore()
  return store[wallet]?.unlocked ?? []
}

export async function getWalletData(wallet: string): Promise<WalletAchievements> {
  const store = await readStore()
  return store[wallet] ?? { unlocked: [] }
}

export async function unlockAchievement(
  wallet: string,
  id: AchievementId,
  evidence?: string,
): Promise<boolean> {
  const store = await readStore()
  const entry = ensureEntry(store, wallet)
  if (entry.unlocked.some((a) => a.id === id)) return false // idempotent
  entry.unlocked.push({ id, unlocked_at: Date.now(), tx_evidence: evidence })
  store[wallet] = entry
  await writeStore(store)
  // Notify (fire-and-forget)
  void createNotification(wallet, "achievement_unlocked", {
    achievement_id: id,
    achievement_name: ACHIEVEMENT_NAMES[id] ?? id,
  }).catch(() => { /* silent */ })
  return true
}

/** Checks counters and unlocks newly earned achievements. Returns newly unlocked IDs. */
export async function checkAndUnlock(
  wallet: string,
  hints?: {
    mints?: number
    has_collection?: boolean
    has_world?: boolean
    signal_posted?: boolean
    upvote_delta?: number
    follower_delta?: number
    narrator_delta?: number
    daily_claim?: boolean
    phaselq_earned?: number
  },
): Promise<AchievementId[]> {
  const store = await readStore()
  const entry = ensureEntry(store, wallet)
  const unlocked = new Set(entry.unlocked.map((a) => a.id))
  const newUnlocks: AchievementId[] = []

  async function tryUnlock(id: AchievementId, evidence?: string) {
    if (unlocked.has(id)) return
    const didUnlock = await unlockAchievement(wallet, id, evidence)
    if (didUnlock) { newUnlocks.push(id); unlocked.add(id) }
  }

  // Mint counts
  if (hints?.mints !== undefined) {
    entry.mint_count = (entry.mint_count ?? 0) + hints.mints
    if (entry.mint_count >= 1)  await tryUnlock("first_mint")
    if (entry.mint_count >= 5)  await tryUnlock("collector_5")
    if (entry.mint_count >= 10) await tryUnlock("collector_10")
  }

  // First collection
  if (hints?.has_collection) await tryUnlock("first_collection")

  // World builder
  if (hints?.has_world) await tryUnlock("world_builder")

  // Signal pioneer
  if (hints?.signal_posted) await tryUnlock("signal_pioneer")

  // Upvotes
  if (hints?.upvote_delta !== undefined) {
    entry.total_upvotes = (entry.total_upvotes ?? 0) + hints.upvote_delta
    if (entry.total_upvotes >= 25) await tryUnlock("community_voice")
  }

  // Followers
  if (hints?.follower_delta !== undefined) {
    entry.follower_count = (entry.follower_count ?? 0) + hints.follower_delta
    if (entry.follower_count >= 10) await tryUnlock("connector_10")
  }

  // Narrator
  if (hints?.narrator_delta !== undefined) {
    entry.narrator_count = (entry.narrator_count ?? 0) + hints.narrator_delta
    if (entry.narrator_count >= 10) await tryUnlock("narrator_10")
  }

  // Daily streak
  if (hints?.daily_claim) {
    const now = Date.now()
    const last = entry.last_daily ?? 0
    const dayMs = 86_400_000
    const withinWindow = last > 0 && now - last < dayMs * 2
    entry.daily_streak = withinWindow ? (entry.daily_streak ?? 0) + 1 : 1
    entry.last_daily = now
    if (entry.daily_streak >= 7)  await tryUnlock("daily_streak_7")
    if (entry.daily_streak >= 30) await tryUnlock("daily_streak_30")
  }

  // PHASELQ (placeholder — would need tracking from faucet totals)
  // For now just check if they've earned any
  if (hints?.phaselq_earned !== undefined && hints.phaselq_earned >= 100) {
    await tryUnlock("phaselq_100")
  }

  store[wallet] = entry
  await writeStore(store)
  return newUnlocks
}
