import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import {
  getWorldForCollection,
  getNarrativeForToken,
} from "@/lib/narrative-world-store"
import {
  phaseProtocolContractIdForServer,
  fetchPhaseProtocolTotalSupply,
  fetchTokenOwnerAddress,
} from "@/lib/phase-protocol"
import {
  buildPhaseTokenMetadataJson,
  publicPhaseSiteBaseUrl,
} from "@/lib/phase-nft-metadata-build"

type Props = {
  params: Promise<{ collection_id: string }>
}

function resolveContractId(): string | null {
  try {
    return phaseProtocolContractIdForServer()
  } catch {
    return null
  }
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collection_id } = await params
  const collectionId = parseInt(collection_id, 10)
  if (!Number.isFinite(collectionId) || collectionId <= 0) return { title: "Not Found" }

  const world = await getWorldForCollection(collectionId).catch(() => null)
  if (!world) return { title: "PHASE World Archive" }

  const base = publicPhaseSiteBaseUrl()
  return {
    title: `${world.world_name} · PHASE World`,
    description: world.world_prompt,
    alternates: { canonical: `${base}/world/${collection_id}` },
    openGraph: {
      title: `${world.world_name} · PHASE World`,
      description: world.world_prompt,
      url: `${base}/world/${collection_id}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${world.world_name} · PHASE World`,
      description: world.world_prompt,
    },
  }
}

type WorldNFT = {
  tokenId: number
  name: string
  image: string
  narrative: string | null
}

export default async function WorldGalleryPage({ params }: Props) {
  const { collection_id } = await params
  const collectionId = parseInt(collection_id, 10)

  if (!Number.isFinite(collectionId) || collectionId <= 0) notFound()

  const [world, contractId] = await Promise.all([
    getWorldForCollection(collectionId).catch(() => null),
    Promise.resolve(resolveContractId()),
  ])

  if (!world) notFound()
  if (!contractId) notFound()

  const scanCap = Math.min(
    500,
    Math.max(1, parseInt(process.env.PHASE_EXPLORE_SCAN_CAP ?? "500", 10)),
  )
  const rawTotal = await fetchPhaseProtocolTotalSupply(contractId)
  const total = Math.min(rawTotal, scanCap)

  let nfts: WorldNFT[] = []

  if (total > 0) {
    const ids = Array.from({ length: total }, (_, i) => i + 1)

    // 1. Scan owners
    const owned = await mapConcurrent(ids, 12, async (id) => {
      try {
        const owner = await fetchTokenOwnerAddress(contractId, id)
        return owner ? id : null
      } catch {
        return null
      }
    })
    const ownedIds = owned.filter((x): x is number => x !== null)

    // 2. Build metadata + filter by collectionId + fetch narratives (single pass)
    const results = await mapConcurrent(ownedIds, 8, async (id) => {
      const meta = await buildPhaseTokenMetadataJson(contractId, id).catch(() => null)
      if (!meta || meta.collectionId !== collectionId) return null
      const narrativeData = await getNarrativeForToken(id).catch(() => null)
      return {
        tokenId: id,
        name: meta.name,
        image: meta.image,
        narrative: narrativeData?.narrative ?? null,
      } satisfies WorldNFT
    })

    nfts = results.filter((x): x is WorldNFT => x !== null)
  }

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <div className="grid-bg pointer-events-none fixed inset-0 opacity-40" aria-hidden />

      {/* Header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b-4 border-double border-violet-500/55 px-4 py-3 md:px-6">
        <Link
          href="/explore"
          className="inline-flex min-h-[36px] items-center border-2 border-violet-400/50 bg-violet-950/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-violet-100 shadow-[0_0_14px_rgba(139,92,246,0.12)] transition-colors hover:border-violet-300 hover:bg-violet-900/40 hover:text-white"
        >
          ← EXPLORE
        </Link>
        <span className="text-center text-[10px] font-bold uppercase tracking-[0.28em] text-violet-200">
          ◈ PHASE · WORLD ARCHIVE
        </span>
        <Link
          href={`/chamber?collection=${collectionId}`}
          className="inline-flex min-h-[36px] items-center border-2 border-violet-400/50 bg-violet-950/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-violet-100 shadow-[0_0_14px_rgba(139,92,246,0.12)] transition-colors hover:border-violet-300 hover:bg-violet-900/40 hover:text-white"
        >
          CHAMBER →
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 md:py-12">

        {/* World header card */}
        <div className="mb-8 border-4 border-double border-violet-500/55 bg-[oklch(0.05_0_0)] p-6 shadow-[0_0_32px_rgba(139,92,246,0.08)] md:p-8">
          <p className="mb-1 text-[9px] uppercase tracking-[0.3em] text-violet-400/60">
            // NARRATIVE WORLD · COLLECTION #{collectionId}
          </p>
          <h1 className="text-[18px] font-bold uppercase tracking-[0.18em] text-violet-100 md:text-[22px]">
            {world.world_name}
          </h1>
          <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-violet-200/70">
            {world.world_prompt}
          </p>
          <p className="mt-4 text-[9px] uppercase tracking-[0.2em] text-violet-400/50">
            ARTIFACTS_INDEXED · <span className="text-violet-300/80">{nfts.length}</span>
          </p>
        </div>

        {/* NFT grid */}
        {nfts.length === 0 ? (
          <div className="border-2 border-violet-500/20 bg-black/40 py-20 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-violet-400/50">
              // NO_ARTIFACTS_FORGED_IN_THIS_WORLD_YET
            </p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {nfts.map((nft) => (
              <li
                key={nft.tokenId}
                className="flex flex-col border-2 border-violet-500/35 bg-black/55 shadow-[inset_0_1px_0_rgba(139,92,246,0.08)] shadow-[0_0_18px_rgba(139,92,246,0.05)]"
              >
                {/* Image */}
                <div className="relative aspect-square overflow-hidden border-b border-violet-500/25 bg-violet-950/10">
                  {nft.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={nft.image}
                      alt={nft.name}
                      className="h-full w-full object-cover opacity-80"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-[9px] uppercase tracking-widest text-violet-400/30">
                        NO_IMAGE
                      </span>
                    </div>
                  )}
                  {/* Token ID badge */}
                  <span className="absolute left-2 top-2 border border-violet-400/40 bg-black/70 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-violet-300/80">
                    #{nft.tokenId}
                  </span>
                  {/* Collection link */}
                  <Link
                    href={`/collection/${nft.tokenId}`}
                    className="absolute inset-0"
                    aria-label={`Ver ${nft.name}`}
                  />
                </div>

                {/* Info */}
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="line-clamp-2 text-[11px] font-semibold uppercase tracking-wide text-violet-50">
                    {nft.name}
                  </p>

                  {nft.narrative && (
                    <blockquote className="border-l-2 border-violet-500/40 pl-2.5">
                      <p className="text-[10px] italic leading-relaxed text-violet-200/65">
                        {nft.narrative}
                      </p>
                    </blockquote>
                  )}

                  {!nft.narrative && (
                    <p className="text-[9px] uppercase tracking-widest text-violet-400/30">
                      // LORE_PENDING
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
