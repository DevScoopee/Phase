import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { nanoid } from "nanoid"
import { serverDataJsonPath } from "@/lib/server-data-paths"

export type Signal = {
  id: string
  author_wallet: string
  author_display: string
  channel: "general" | "showcase" | string
  title: string
  body: string
  nft_token_id?: number
  nft_collection_id?: number
  nft_name?: string
  nft_image?: string
  upvotes: string[]
  created_at: number
  signature: string
}

export type SignalReply = {
  id: string
  signal_id: string
  author_wallet: string
  author_display: string
  body: string
  upvotes: string[]
  created_at: number
  signature: string
}

type SignalsStore = Record<string, Signal>
type SignalRepliesStore = Record<string, SignalReply>

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

/** hot = upvotes + recency weighted (upvotes * 3 + created_at/1000) */
function hotScore(s: Signal): number {
  return s.upvotes.length * 3 + s.created_at / 1000
}

export async function getSignals(
  channel?: string,
  sort: "hot" | "new" | "top" = "hot",
): Promise<Signal[]> {
  const store = await readJsonStore<SignalsStore>(serverDataJsonPath("signals"))
  let items = Object.values(store)
  if (channel && channel !== "all") {
    items = items.filter((s) => s.channel === channel)
  }
  if (sort === "new") {
    items.sort((a, b) => b.created_at - a.created_at)
  } else if (sort === "top") {
    items.sort((a, b) => b.upvotes.length - a.upvotes.length)
  } else {
    items.sort((a, b) => hotScore(b) - hotScore(a))
  }
  return items
}

export async function getSignal(id: string): Promise<Signal | null> {
  const store = await readJsonStore<SignalsStore>(serverDataJsonPath("signals"))
  return store[id] ?? null
}

export async function createSignal(
  data: Omit<Signal, "id" | "created_at">,
): Promise<Signal> {
  const filePath = serverDataJsonPath("signals")
  const store = await readJsonStore<SignalsStore>(filePath)
  const signal: Signal = { ...data, id: nanoid(10), created_at: Date.now() }
  store[signal.id] = signal
  await writeJsonStore(filePath, store)
  return signal
}

export async function upvoteSignal(id: string, wallet: string): Promise<Signal> {
  const filePath = serverDataJsonPath("signals")
  const store = await readJsonStore<SignalsStore>(filePath)
  const signal = store[id]
  if (!signal) throw new Error("Signal not found")
  const idx = signal.upvotes.indexOf(wallet)
  if (idx === -1) {
    signal.upvotes.push(wallet)
  } else {
    signal.upvotes.splice(idx, 1)
  }
  await writeJsonStore(filePath, store)
  return signal
}

export async function getReplies(signal_id: string): Promise<SignalReply[]> {
  const store = await readJsonStore<SignalRepliesStore>(serverDataJsonPath("signalReplies"))
  return Object.values(store)
    .filter((r) => r.signal_id === signal_id)
    .sort((a, b) => a.created_at - b.created_at)
}

export async function createReply(
  data: Omit<SignalReply, "id" | "created_at">,
): Promise<SignalReply> {
  const filePath = serverDataJsonPath("signalReplies")
  const store = await readJsonStore<SignalRepliesStore>(filePath)
  const reply: SignalReply = { ...data, id: nanoid(10), created_at: Date.now() }
  store[reply.id] = reply
  await writeJsonStore(filePath, store)
  return reply
}

export async function getSignalChannelStats(
  worldNames: Record<string, string>,
): Promise<Array<{ id: string; label: string; count: number }>> {
  const store = await readJsonStore<SignalsStore>(serverDataJsonPath("signals"))
  const counts: Record<string, number> = {}
  for (const s of Object.values(store)) {
    counts[s.channel] = (counts[s.channel] ?? 0) + 1
  }
  const total = Object.values(store).length

  const channels: Array<{ id: string; label: string; count: number }> = [
    { id: "all", label: "All signals", count: total },
    { id: "showcase", label: "NFT showcase", count: counts["showcase"] ?? 0 },
    { id: "general", label: "General", count: counts["general"] ?? 0 },
  ]
  for (const [id, label] of Object.entries(worldNames)) {
    channels.push({ id, label, count: counts[id] ?? 0 })
  }
  return channels
}
