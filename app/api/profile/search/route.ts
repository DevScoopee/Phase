import { NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import { serverDataJsonPath } from "@/lib/server-data-paths"
import type { ProfileData } from "@/lib/profile-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProfileStore = Record<string, ProfileData>

type NarrativesStore = Record<string, { collection_id: number }>

type SearchResult = {
  wallet: string
  display_name: string | null
  twitter: string | null
  discord: string | null
  telegram: string | null
  artifact_count: number
}

async function readJson<T extends object>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T
  } catch {
    return {} as T
  }
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? ""
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const [profiles, narratives] = await Promise.all([
    readJson<ProfileStore>(serverDataJsonPath("profileSocials")),
    readJson<NarrativesStore>(serverDataJsonPath("worldNarratives")),
  ])

  // Count narratives per wallet — not perfect but free
  const narrativeCountByWallet: Record<string, number> = {}
  for (const n of Object.values(narratives)) {
    // narratives don't store wallet directly; approximate via collection_id only
    // skip — default to 0
  }
  void narrativeCountByWallet

  const results: SearchResult[] = []

  for (const [wallet, data] of Object.entries(profiles)) {
    const name = (data.display_name ?? "").toLowerCase()
    const twitter = (data.twitter ?? "").toLowerCase()
    const discord = (data.discord ?? "").toLowerCase()
    const walletLower = wallet.toLowerCase()

    const matches =
      name.includes(q) ||
      twitter.includes(q) ||
      discord.includes(q) ||
      walletLower.startsWith(q)

    if (matches) {
      results.push({
        wallet,
        display_name: data.display_name ?? null,
        twitter: data.twitter ?? null,
        discord: data.discord ?? null,
        telegram: data.telegram ?? null,
        artifact_count: 0,
      })
    }

    if (results.length >= 10) break
  }

  return NextResponse.json({ results })
}
