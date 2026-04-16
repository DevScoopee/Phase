import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from "@/lib/notification-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim() ?? ""
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "valid wallet required" }, { status: 400 })
  }
  const [notifications, unread_count] = await Promise.all([
    getNotifications(wallet),
    getUnreadCount(wallet),
  ])
  return NextResponse.json({ notifications, unread_count })
}

type NotifActionBody = {
  wallet?: unknown
  action?: unknown
  id?: unknown
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

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
