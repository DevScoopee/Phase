import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import {
  getNotifications,
  getNotificationPreferences,
  getUnreadCount,
  isNotificationPreferencesEnabled,
  markAllRead,
  markRead,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim() ?? ""
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "valid wallet required" }, { status: 400 })
  }
  const [notifications, unread_count, preferences] = await Promise.all([
    getNotifications(wallet),
    getUnreadCount(wallet),
    getNotificationPreferences(wallet),
  ])
  return NextResponse.json({
    notifications,
    unread_count,
    preferences,
    preferences_feature_enabled: isNotificationPreferencesEnabled(),
  })
}

type NotifActionBody = {
  wallet?: unknown
  action?: unknown
  id?: unknown
  preferences?: unknown
}

function parsePreferencePatch(input: unknown): Partial<Omit<NotificationPreferences, "updated_at">> | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const patch: Partial<Omit<NotificationPreferences, "updated_at">> = {}

  if (typeof raw.enabled === "boolean") {
    patch.enabled = raw.enabled
  }

  if (raw.types && typeof raw.types === "object" && !Array.isArray(raw.types)) {
    const types: NotificationPreferences["types"] = {}
    for (const [key, value] of Object.entries(raw.types as Record<string, unknown>)) {
      if (typeof value === "boolean") {
        types[key as keyof NotificationPreferences["types"]] = value
      }
    }
    patch.types = types
  }

  return patch
}

export async function POST(request: NextRequest) {
  let body: NotifActionBody
  try {
    body = (await request.json()) as NotifActionBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : ""
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "valid wallet required" }, { status: 400 })
  }

  if (body.action === "mark_read") {
    if (typeof body.id === "string" && body.id.trim()) {
      await markRead(wallet, body.id.trim())
    } else {
      await markAllRead(wallet)
    }
    return NextResponse.json({ ok: true })
  }

  if (body.action === "update_preferences") {
    const patch = parsePreferencePatch(body.preferences)
    if (!patch) {
      return NextResponse.json({ error: "valid preferences required" }, { status: 400 })
    }
    const preferences = await saveNotificationPreferences(wallet, patch)
    return NextResponse.json({
      ok: true,
      preferences,
      preferences_feature_enabled: isNotificationPreferencesEnabled(),
    })
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}