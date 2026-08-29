import { NextRequest, NextResponse } from "next/server"
import { getSignal, takedownSignal, restoreSignal, isModerationEnabled } from "@/lib/signal-store"
import { createNotification } from "@/lib/notification-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ModerateBody = {
  action?: unknown
  reason?: unknown
}

/**
 * POST /api/signals/[id]/moderate
 *
 * Takes down or restores a signal (narrative content moderation, phase-113).
 * Body JSON: { "action": "takedown" | "restore", "reason"?: string }
 * Requires header `x-admin-key` equal to `PHASE_ADMIN_KEY` if defined.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isModerationEnabled()) {
    return NextResponse.json({ error: "Moderation is disabled (set NEXT_PUBLIC_FEATURE_PHASE_113=1)" }, { status: 404 })
  }

  const adminKey = process.env.PHASE_ADMIN_KEY?.trim()
  if (adminKey) {
    const provided = request.headers.get("x-admin-key")?.trim()
    if (provided !== adminKey) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }
  }

  const { id } = await params
  let body: ModerateBody
  try {
    body = (await request.json()) as ModerateBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const action = body.action
  if (action !== "takedown" && action !== "restore") {
    return NextResponse.json({ error: "action must be 'takedown' or 'restore'" }, { status: 400 })
  }

  const existing = await getSignal(id)
  if (!existing) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 })
  }

  try {
    if (action === "takedown") {
      const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Violates community guidelines"
      const signal = await takedownSignal(id, reason)
      void createNotification(signal.author_wallet, "content_takedown", {
        signal_id: id,
        signal_title: signal.title,
        reason,
      }).catch(() => { /* silent */ })
      return NextResponse.json({ signal })
    }

    const signal = await restoreSignal(id)
    return NextResponse.json({ signal })
  } catch {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 })
  }
}
