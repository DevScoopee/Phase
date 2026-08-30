import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import {
  fetchPhaseProtocolTotalSupply,
  fetchTokenOwnerAddress,
  phaseProtocolContractIdForServer,
} from "@/lib/phase-protocol"
import { buildPhaseTokenMetadataJson } from "@/lib/phase-nft-metadata-build"
import { extractBaseAddress } from "@stellar/stellar-sdk"
import { getAllWorldCollections } from "@/lib/narrative-world-store"
import { isFeatureEnabled } from "@/lib/feature-flags"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export type ExploreItem = {
  tokenId: number
  name: string
  image: string
  contentHash?: string
  duplicateOfTokenId?: number
  collectionId: number | null
  ownerTruncated: string
  worldName?: string
}

function truncateAddress(addr: string): string {
  const t = addr.trim()
  if (t.length < 14) return t
  return `${t.slice(0, 6)}…${t.slice(-4)}`
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    for (;;) {
      const idx = i++
      if (idx >= items.length) return
      out[idx] = await fn(items[idx]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export function assetContentHash(item: Pick<ExploreItem, "image">): string | null {
  const image = item.image.trim().toLowerCase()
  if (!image) return null
  return createHash("sha256").update(image, "utf8").digest("hex")
}

export function dedupeExploreItems(items: ExploreItem[]): ExploreItem[] {
  if (!isFeatureEnabled("phase-127")) return items
  const firstByHash = new Map<string, number>()
  return items.map((item) => {
    const contentHash = assetContentHash(item)
    if (!contentHash) return item
    const firstTokenId = firstByHash.get(contentHash)
    if (firstTokenId === undefined) {
      firstByHash.set(contentHash, item.tokenId)
      return { ...item, contentHash }
    }
    return { ...item, contentHash, duplicateOfTokenId: firstTokenId }
  })
}

export async function GET(request: NextRequest) {
  const contractId = phaseProtocolContractIdForServer()
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10))
  const perPage = Math.min(500, Math.max(1, parseInt(request.nextUrl.searchParams.get("perPage") ?? "24", 10)))
  const collectionIdFilter = (() => {
    const raw = request.nextUrl.searchParams.get("collectionId")
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const scanCap = Math.min(
    500,
    Math.max(1, parseInt(process.env.PHASE_EXPLORE_SCAN_CAP ?? "500", 10)),
  )

  const rawTotal = await fetchPhaseProtocolTotalSupply(contractId)
  const total = Math.min(rawTotal, scanCap)
  if (total <= 0) {
    return NextResponse.json(
      { items: [] as ExploreItem[], total: 0, page, perPage },
      { headers: { ...CORS, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" } },
    )
  }

  // Scan all token IDs concurrently to find those with an owner.
  // Each call is individually bounded by the RPC timeout inside fetchTokenOwnerAddress.
  const ids = Array.from({ length: total }, (_, i) => i + 1)
  const owners = await mapConcurrent(ids, 12, async (id) => {
    try {
      const owner = await fetchTokenOwnerAddress(contractId, id)
      return owner ? { id, owner } : null
    } catch {
      return null
    }
  })
  const found = owners.filter((x): x is { id: number; owner: string } => x !== null)

  // Read world sidecar once — O(1) per request, not per item.
  const worldCollections = await getAllWorldCollections().catch(() => ({} as Record<string, { world_name: string }>))

  function buildItem(
    id: number,
    owner: string,
    meta: Awaited<ReturnType<typeof buildPhaseTokenMetadataJson>>,
  ): ExploreItem {
    let ownerBase = owner
    try { ownerBase = extractBaseAddress(owner) } catch { /* keep raw */ }
    const collectionId = meta?.collectionId ?? null
    const worldName =
      collectionId != null
        ? (worldCollections[String(collectionId)]?.world_name ?? undefined)
        : undefined
    return {
      tokenId: id,
      name: meta?.name ?? `Phase Artifact #${id}`,
      image: meta?.image ?? "",
      collectionId,
      ownerTruncated: truncateAddress(ownerBase),
      worldName,
    }
  }

  let items: ExploreItem[]
  let totalFound: number

  if (collectionIdFilter != null) {
    // Filtered path: must build metadata for all tokens to filter by collectionId.
    // Single metadata pass — no double fetch.
    const allWithMeta = await mapConcurrent(found, 12, async ({ id, owner }) => {
      const meta = await buildPhaseTokenMetadataJson(contractId, id).catch(() => null)
      return { id, owner, meta }
    })
    const filtered = allWithMeta.filter((x) => (x.meta?.collectionId ?? null) === collectionIdFilter)
    totalFound = filtered.length
    const slice = filtered.slice((page - 1) * perPage, page * perPage)
    items = dedupeExploreItems(slice.map(({ id, owner, meta }) => buildItem(id, owner, meta)))
  } else {
    // Normal path: paginate first, then fetch metadata for this page only.
    totalFound = found.length
    const slice = found.slice((page - 1) * perPage, page * perPage)
    items = await mapConcurrent(slice, 6, async ({ id, owner }) => {
      const meta = await buildPhaseTokenMetadataJson(contractId, id)
      return buildItem(id, owner, meta)
    })
    items = dedupeExploreItems(items)
  }

  return NextResponse.json(
    { items, total: totalFound, page, perPage, content_hash_dedup_enabled: isFeatureEnabled("phase-127") },
    {
      headers: {
        ...CORS,
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    },
  )
}
