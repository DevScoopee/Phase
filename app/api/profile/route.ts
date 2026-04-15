import { NextRequest, NextResponse } from "next/server"
import { getProfile, saveProfile } from "@/lib/profile-store"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim()
  if (!wallet || wallet.length < 10) {
    return NextResponse.json({ error: "wallet param required" }, { status: 400 })
  }
  const profile = await getProfile(wallet)
  return NextResponse.json({ wallet, profile: profile ?? null })
}

type ProfileBody = {
  wallet?: unknown
  display_name?: unknown
  twitter?: unknown
  discord?: unknown
  telegram?: unknown
}

function sanitizeHandle(value: unknown, prefix: string): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim().replace(/^@/, "")
  if (!trimmed) return undefined
  return `${prefix}${trimmed}`
}

export async function POST(request: NextRequest) {
  let body: ProfileBody
  try {
    body = (await request.json()) as ProfileBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : ""
  if (!wallet || wallet.length < 10) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 })
  }

  const display_name =
    typeof body.display_name === "string" ? body.display_name.trim().slice(0, 40) || undefined : undefined
  const twitter = sanitizeHandle(body.twitter, "")
  const discord = typeof body.discord === "string" ? body.discord.trim().slice(0, 40) || undefined : undefined
  const telegram = sanitizeHandle(body.telegram, "")

  const profile = await saveProfile(wallet, { display_name, twitter, discord, telegram })
  return NextResponse.json({ ok: true, profile })
}
