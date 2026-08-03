import { NextResponse, type NextRequest } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { buildPhaseTokenMetadataJson } from "@/lib/phase-nft-metadata-build"
import {
  fetchOwnedPhaseTokenIdsForWallet,
  phaseProtocolContractIdForServer,
} from "@/lib/phase-protocol"
import { mercuryConfigured, fetchTokenIdsOwnedByMercury } from "@/lib/mercury-classic"

export const dynamic = "force-dynamic"

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim()
  const n = raw ? parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

async function mapWithConcurrency<T, R>(
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
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return out
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim() ?? ""
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 })
  }

  let contractId: string
  try {
    contractId = phaseProtocolContractIdForServer()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "contract config", detail: msg }, { status: 500 })
  }

  const scanCap = intEnv("PHASE_NFT_WALLET_SCAN_CAP", 5000, 1, 50_000)
  const scanConc = intEnv("PHASE_NFT_WALLET_SCAN_CONCURRENCY", 8, 1, 16)
  const metaConc = intEnv("PHASE_NFT_WALLET_METADATA_CONCURRENCY", 4, 1, 12)

  // Mercury Classic es más rápido que RPC scan — úsalo si está configurado
  let tokenIds: number[]
  let indexedVia: string
  if (mercuryConfigured()) {
    try {
      tokenIds = await fetchTokenIdsOwnedByMercury(contractId, address)
      indexedVia = "mercury-classic"
    } catch {
      tokenIds = await fetchOwnedPhaseTokenIdsForWallet(address, {
        contractId,
        maxTokenIdCap: scanCap,
        concurrency: scanConc,
      })
      indexedVia = "soroban-rpc-fallback"
    }
  } else {
    tokenIds = await fetchOwnedPhaseTokenIdsForWallet(address, {
      contractId,
      maxTokenIdCap: scanCap,
      concurrency: scanConc,
    })
    indexedVia = "soroban-rpc"
  }

  const items = await mapWithConcurrency(tokenIds, metaConc, async (tokenId) => {
    const meta = await buildPhaseTokenMetadataJson(contractId, tokenId)
    if (!meta) {
      return {
        tokenId,
        name: `Phase Artifact #${tokenId}`,
        description: "",
        image: "",
        collectionId: null as number | null,
      }
    }
    const { name, description, image, collectionId } = meta
    return { tokenId, name, description, image, collectionId }
  })

  return NextResponse.json(
    {
      contractId,
      owner: address,
      tokenIds,
      items,
      indexedVia,
    },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "private, no-store",
      },
    },
  )
}
