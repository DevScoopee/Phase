import { NextRequest, NextResponse } from "next/server"
import {
  fetchPhaseProtocolTotalSupply,
  fetchTokenOwnerAddress,
  phaseProtocolContractIdForServer,
} from "@/lib/phase-protocol"
import { buildPhaseTokenMetadataJson } from "@/lib/phase-nft-metadata-build"
import { extractBaseAddress } from "@stellar/stellar-sdk"

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
  collectionId: number | null
  ownerTruncated: string
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

export async function GET(request: NextRequest) {
  const contractId = phaseProtocolContractIdForServer()
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10))
  const perPage = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get("perPage") ?? "24", 10)))

  const total = await fetchPhaseProtocolTotalSupply(contractId)
  if (total <= 0) {
    return NextResponse.json(
      { items: [] as ExploreItem[], total: 0, page, perPage },
      { headers: { ...CORS, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" } },
    )
  }

  // Scan all token IDs concurrently to find those with an owner
  const ids = Array.from({ length: total }, (_, i) => i + 1)
  const owners = await mapConcurrent(ids, 12, async (id) => {
    const owner = await fetchTokenOwnerAddress(contractId, id)
    return owner ? { id, owner } : null
  })
  const found = owners.filter((x): x is { id: number; owner: string } => x !== null)

  // Paginate found tokens
  const totalFound = found.length
  const slice = found.slice((page - 1) * perPage, page * perPage)

  // Build metadata for this page only
  const items = await mapConcurrent(slice, 6, async ({ id, owner }) => {
    const meta = await buildPhaseTokenMetadataJson(contractId, id)
    let ownerBase = owner
    try { ownerBase = extractBaseAddress(owner) } catch { /* keep raw */ }
    return {
      tokenId: id,
      name: meta?.name ?? `Phase Artifact #${id}`,
      image: meta?.image ?? "",
      collectionId: meta?.collectionId ?? null,
      ownerTruncated: truncateAddress(ownerBase),
    } satisfies ExploreItem
  })

  return NextResponse.json(
    { items, total: totalFound, page, perPage },
    {
      headers: {
        ...CORS,
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    },
  )
}
