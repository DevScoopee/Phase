import { NextRequest, NextResponse } from "next/server"
import {
  fetchPhaseProtocolTotalSupply,
  fetchTokenOwnerAddress,
  phaseProtocolContractIdForServer,
} from "@/lib/phase-protocol"
import { buildPhaseTokenMetadataJson } from "@/lib/phase-nft-metadata-build"
import { extractBaseAddress } from "@stellar/stellar-sdk"
import { getAllWorldCollections } from "@/lib/narrative-world-store"
import { isFeatureEnabled } from "@/lib/feature-flags"
import {
  dedupeExploreItems,
  isQuestExpiryEnabled,
  mapConcurrent,
  paginateExploreItems,
  truncateAddress,
  type ExploreItem,
} from "@/lib/explore-domain"

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

function parsePageParam(value: string | null, fallback: number, max: number): number {
  const n = parseInt(value ?? "", 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(max, n)
}

function parseCollectionFilter(value: string | null): number | null {
  if (!value) return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function GET(request: NextRequest) {
  try {
    const contractId = phaseProtocolContractIdForServer()
    const page = parsePageParam(request.nextUrl.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER)
    const perPage = parsePageParam(request.nextUrl.searchParams.get("perPage"), 24, 500)
    const collectionIdFilter = parseCollectionFilter(request.nextUrl.searchParams.get("collectionId"))
    const dedupeEnabled = isFeatureEnabled("phase-127")

    const scanCap = parsePageParam(process.env.PHASE_EXPLORE_SCAN_CAP ?? null, 500, 500)

    const rawTotal = await fetchPhaseProtocolTotalSupply(contractId)
    const total = Math.min(rawTotal, scanCap)
    if (total <= 0) {
      return NextResponse.json(
        { items: [] as ExploreItem[], total: 0, page, perPage },
        { headers: { ...CORS, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" } },
      )
    }

    // Scan all token IDs concurrently (bounded — see lib/explore-domain.mapConcurrent).
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
      const allWithMeta = await mapConcurrent(found, 12, async ({ id, owner }) => {
        const meta = await buildPhaseTokenMetadataJson(contractId, id).catch(() => null)
        return { id, owner, meta }
      })
      const filtered = allWithMeta.filter((x) => (x.meta?.collectionId ?? null) === collectionIdFilter)
      totalFound = filtered.length
      const slice = paginateExploreItems(filtered, page, perPage)
      items = dedupeEnabled ? dedupeExploreItems(slice.map(({ id, owner, meta }) => buildItem(id, owner, meta))) : slice.map(({ id, owner, meta }) => buildItem(id, owner, meta))
    } else {
      // Normal path: paginate first, then fetch metadata for this page only.
      totalFound = found.length
      const slice = paginateExploreItems(found, page, perPage)
      const built = await mapConcurrent(slice, 6, async ({ id, owner }) => {
        const meta = await buildPhaseTokenMetadataJson(contractId, id)
        return buildItem(id, owner, meta)
      })
      items = dedupeEnabled ? dedupeExploreItems(built) : built
    }

    return NextResponse.json(
      {
        items,
        total: totalFound,
        page,
        perPage,
        content_hash_dedup_enabled: dedupeEnabled,
        quest_expiry_windows_enabled: isQuestExpiryEnabled(),
      },
      {
        headers: {
          ...CORS,
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown explore error"
    return NextResponse.json(
      { error: "EXPLORE_FETCH_FAILED", message },
      { status: 500, headers: { ...CORS, "Cache-Control": "no-store" } },
    )
  }
}
