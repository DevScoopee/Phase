import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { serverDataJsonPath } from "@/lib/server-data-paths"

export type NotificationType =
  | "mint_in_collection"
  | "narrator_generated"
  | "new_follower"
  | "signal_reply"
  | "signal_upvote"
  | "quest_completed"
  | "world_mint"
  | "new_offer"
  | "offer_accepted"
  | "offer_rejected"
  | "achievement_unlocked"

export type Notification = {
  id: string
  wallet: string
  type: NotificationType
  read: boolean
  created_at: number
  data: Record<string, unknown>
}

type NotificationStore = Record<string, Notification[]>

const MAX_PER_WALLET = 50

async function readStore(): Promise<NotificationStore> {
  try {
    return JSON.parse(await readFile(serverDataJsonPath("notifications"), "utf8")) as NotificationStore
  } catch {
    return {}
  }
}

async function writeStore(data: NotificationStore): Promise<void> {
  const filePath = serverDataJsonPath("notifications")
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

export async function createNotification(
  wallet: string,
  type: NotificationType,
  data: Record<string, unknown>,
): Promise<void> {
  const store = await readStore()
  const list = store[wallet] ?? []
  const notif: Notification = {
    id: randomUUID(),
    wallet,
    type,
    read: false,
    created_at: Date.now(),
    data,
  }
  // Prepend newest first; cap at MAX_PER_WALLET
  const updated = [notif, ...list].slice(0, MAX_PER_WALLET)
  store[wallet] = updated
  await writeStore(store)
}

export async function getNotifications(wallet: string, limit = 30): Promise<Notification[]> {
  const store = await readStore()
  return (store[wallet] ?? []).slice(0, limit)
}

export async function markRead(wallet: string, notificationId: string): Promise<void> {
  const store = await readStore()
  const list = store[wallet]
  if (!list) return
  store[wallet] = list.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
  await writeStore(store)
}

export async function markAllRead(wallet: string): Promise<void> {
  const store = await readStore()
  const list = store[wallet]
  if (!list) return
  store[wallet] = list.map((n) => ({ ...n, read: true }))
  await writeStore(store)
}

export async function getUnreadCount(wallet: string): Promise<number> {
  const store = await readStore()
  return (store[wallet] ?? []).filter((n) => !n.read).length
}
