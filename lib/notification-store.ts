import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { createHash } from "node:crypto"
import { z } from "zod"
import { isFeatureEnabled, flagRollbackNote } from "@/lib/feature-flags"
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
type GatewayAuthRotationStore = Record<string, GatewayAuthRotation>

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

export function isPhase128Enabled(): boolean {
  return isFeatureEnabled("phase-128")
}

export function phase128RollbackNote(): string {
  return flagRollbackNote("phase-128")
}

export const GatewayAuthRotationSchema = z.object({
  gateway: z.string().trim().min(2).max(64).regex(/^[a-z0-9._-]+$/i),
  private_tier: z.enum(["starter", "pro", "enterprise"]),
  next_token: z.string().trim().min(16).max(4096),
  rotated_by: z.string().trim().min(1).max(128),
  overlap_ms: z.number().int().min(0).max(86_400_000).default(900_000),
})

export type GatewayAuthRotationInput = z.infer<typeof GatewayAuthRotationSchema>

export type GatewayAuthRotation = {
  gateway: string
  private_tier: GatewayAuthRotationInput["private_tier"]
  active_token_hash: string
  previous_token_hash: string | null
  previous_expires_at: number | null
  rotated_by: string
  rotated_at: number
}

export class GatewayAuthRotationError extends Error {
  code: "FLAG_DISABLED" | "VALIDATION_FAILED"
  details?: unknown

  constructor(code: GatewayAuthRotationError["code"], message: string, details?: unknown) {
    super(message)
    this.name = "GatewayAuthRotationError"
    this.code = code
    this.details = details
  }
}

function hashGatewayToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

function gatewayRotationKey(gateway: string, privateTier: string): string {
  return `${gateway.toLowerCase()}:${privateTier}`
}

async function readGatewayAuthRotationStore(): Promise<GatewayAuthRotationStore> {
  try {
    const raw = await readFile(serverDataJsonPath("ipfsGatewayAuthRotations"), "utf8")
    const parsed = JSON.parse(raw) as GatewayAuthRotationStore
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function writeGatewayAuthRotationStore(data: GatewayAuthRotationStore): Promise<void> {
  const filePath = serverDataJsonPath("ipfsGatewayAuthRotations")
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

export async function rotateIpfsGatewayAuth(input: unknown, opts: { force?: boolean; now?: number } = {}): Promise<GatewayAuthRotation> {
  if (!opts.force && !isPhase128Enabled()) {
    throw new GatewayAuthRotationError("FLAG_DISABLED", "phase-128 flag disabled", {
      rollback: phase128RollbackNote(),
    })
  }

  const parsed = GatewayAuthRotationSchema.safeParse(input)
  if (!parsed.success) {
    throw new GatewayAuthRotationError("VALIDATION_FAILED", "valid gateway rotation payload required", parsed.error.flatten())
  }

  const now = opts.now ?? Date.now()
  const data = parsed.data
  const store = await readGatewayAuthRotationStore()
  const key = gatewayRotationKey(data.gateway, data.private_tier)
  const current = store[key]
  const activeTokenHash = hashGatewayToken(data.next_token)

  const rotation: GatewayAuthRotation = {
    gateway: data.gateway,
    private_tier: data.private_tier,
    active_token_hash: activeTokenHash,
    previous_token_hash: current?.active_token_hash && current.active_token_hash !== activeTokenHash
      ? current.active_token_hash
      : current?.previous_token_hash ?? null,
    previous_expires_at: current?.active_token_hash && current.active_token_hash !== activeTokenHash
      ? now + data.overlap_ms
      : current?.previous_expires_at ?? null,
    rotated_by: data.rotated_by,
    rotated_at: now,
  }

  store[key] = rotation
  await writeGatewayAuthRotationStore(store)
  return rotation
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
