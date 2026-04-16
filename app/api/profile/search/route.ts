import { NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import { serverDataJsonPath } from "@/lib/server-data-paths"
import type { ProfileData } from "@/lib/profile-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProfileStore = Record<string, ProfileData>
type NarrativesStore = Record<string, { collection_id: number }>
type WorldCollectionsStore = Record<string, { world_name: string }>
type NftListingsFile = { listings?: Array<{ tokenId?: number; seller?: string; collectionId?: number }> }
type FollowStore = Record<string, { following: string[] }>

export type SearchResult = {
  wallet: string
  display_name: string | null
  twitter: string | null
  discord: string | null
  telegram: string | null
  artifact_count: number
  has_world: boolean
  world_name: string | null
  is_following: boolean
}

async function readJson<T extends object>(filePath: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T
  } catch {
    return {} as T
  }
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? ""
  const filter = request.nextUrl.searchParams.get("filter") ?? "all"
  const viewer = request.nextUrl.searchParams.get("viewer")?.trim() ?? ""

  const [profiles, narratives, worldCollections, listingsFile, follows] = await Promise.all([
    readJson<ProfileStore>(serverDataJsonPath("profileSocials")),
    readJson<NarrativesStore>(serverDataJsonPath("worldNarratives")),
    readJson<WorldCollectionsStore>(serverDataJsonPath("worldCollections")),
    readJson<NftListingsFile>(serverDataJsonPath("nftListings")),
    readJson<FollowStore>(serverDataJsonPath("profileFollows")),
  ])

  // Build wallet → artifact_count from listings
  const walletArtifactCount = new Map<string, number>()
  // Build wallet → first world collection data
  const walletWorldName = new Map<string, string>()

  // tokenId → collection_id from narratives
  const tokenCollectionId = new Map<number, number>()
  for (const [tokenId, data] of Object.entries(narratives)) {
    tokenCollectionId.set(Number(tokenId), data.collection_id)
  }

  // seller → collectionIds from listings; cross-ref with narratives to find worlds
  for (const listing of listingsFile.listings ?? []) {
    if (typeof listing.seller !== "string" || typeof listing.tokenId !== "number") continue
    const seller = listing.seller
    walletArtifactCount.set(seller, (walletArtifactCount.get(seller) ?? 0) + 1)
    // If this token has a narrative, this seller is a world creator
    const colId = tokenCollectionId.get(listing.tokenId)
    if (colId !== undefined && !walletWorldName.has(seller)) {
      const worldName = worldCollections[String(colId)]?.world_name
      if (worldName) walletWorldName.set(seller, worldName)
    }
  }

  // Viewer's following set
  const viewerFollowing = new Set<string>(viewer ? (follows[viewer]?.following ?? []) : [])

  // Total collector count
  const totalCollectors = Object.keys(profiles).length

  // Build results from profiles
  const allResults: SearchResult[] = []

  for (const [wallet, data] of Object.entries(profiles)) {
    const name = (data.display_name ?? "").toLowerCase()
    const twitter = (data.twitter ?? "").toLowerCase()
    const discord = (data.discord ?? "").toLowerCase()
    const walletLower = wallet.toLowerCase()

    const matchesQuery =
      q.length < 2 ||
      name.includes(q) ||
      twitter.includes(q) ||
      discord.includes(q) ||
      walletLower.startsWith(q)

    if (!matchesQuery) continue

    const artifactCount = walletArtifactCount.get(wallet) ?? 0
    const worldName = walletWorldName.get(wallet) ?? null
    const hasWorld = worldName !== null
    const isFollowing = viewerFollowing.has(wallet)

    // Apply filter
    if (filter === "collectors" && artifactCount === 0) continue
    if (filter === "world_creators" && !hasWorld) continue
    if (filter === "following" && !isFollowing) continue

    allResults.push({
      wallet,
      display_name: data.display_name ?? null,
      twitter: data.twitter ?? null,
      discord: data.discord ?? null,
      telegram: data.telegram ?? null,
      artifact_count: artifactCount,
      has_world: hasWorld,
      world_name: worldName,
      is_following: isFollowing,
    })
  }

  // Sort by artifact_count desc
  allResults.sort((a, b) => b.artifact_count - a.artifact_count)

  const results = allResults.slice(0, 10)

  // Suggested: top 5 by artifact_count when no query
  const suggested: SearchResult[] = []
  if (q.length < 2 && filter === "all") {
    const top = [...allResults].sort((a, b) => b.artifact_count - a.artifact_count).slice(0, 5)
    suggested.push(...top)
  }

  return NextResponse.json({ results, suggested, totalCollectors })
}
