import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { serverDataJsonPath } from "@/lib/server-data-paths"

type FollowEntry = {
  following: string[]   // wallets this address follows
  followers: string[]   // wallets following this address
}

type FollowStore = Record<string, FollowEntry>

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
