import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { serverDataJsonPath } from "@/lib/server-data-paths"

export type NotificationType =
  | "mint_in_collection"
  | "narrator_generated"
  | "new_follower"
  | "signal_reply"
  | "mention"
  | "signal_upvote"
  | "quest_completed"
  | "world_mint"
  | "new_offer"
  | "offer_accepted"
  | "offer_rejected"
  | "achievement_unlocked"
  | "content_takedown"

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
// phase-98: profile-level notification preferences.
// Rollback: unset NEXT_PUBLIC_FEATURE_PHASE_98 / FEATURE_PHASE_98; existing notifications remain readable.
export type NotificationPreferences = {
  enabled: boolean
  types: Partial<Record<NotificationType, boolean>>
  updated_at: number
}

type NotificationPreferenceStore = Record<string, NotificationPreferences>

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  types: {},
  updated_at: 0,
}

export function isNotificationPreferencesEnabled(): boolean {
  const value = (process.env.NEXT_PUBLIC_FEATURE_PHASE_98 ?? process.env.FEATURE_PHASE_98 ?? "").trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

async function readPreferenceStore(): Promise<NotificationPreferenceStore> {
  try {
    const raw = await readFile(serverDataJsonPath("notificationPreferences"), "utf8")
    const parsed = JSON.parse(raw) as NotificationPreferenceStore
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function writePreferenceStore(data: NotificationPreferenceStore): Promise<void> {
  const filePath = serverDataJsonPath("notificationPreferences")
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

export async function getNotificationPreferences(wallet: string): Promise<NotificationPreferences> {
  const store = await readPreferenceStore()
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(store[wallet] ?? {}) }
}

export async function saveNotificationPreferences(
  wallet: string,
  preferences: Partial<Omit<NotificationPreferences, "updated_at">>,
): Promise<NotificationPreferences> {
  const current = await getNotificationPreferences(wallet)
  const next: NotificationPreferences = {
    enabled: preferences.enabled ?? current.enabled,
    types: { ...current.types, ...(preferences.types ?? {}) },
    updated_at: Date.now(),
  }
  const store = await readPreferenceStore()
  store[wallet] = next
  await writePreferenceStore(store)
  return next
}

export async function shouldStoreNotification(wallet: string, type: NotificationType): Promise<boolean> {
  if (!isNotificationPreferencesEnabled()) return true
  const preferences = await getNotificationPreferences(wallet)
  if (!preferences.enabled) return false
  return preferences.types[type] ?? true
}

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
  if (!(await shouldStoreNotification(wallet, type))) return

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