import Link from "next/link"
import type { Metadata } from "next"
import { LangToggle } from "@/components/lang-toggle"
import {
  getAllWorldCollections,
  getRecentNarrativesForCollection,
  type WorldCollectionData,
  type WorldNarrativeData,
} from "@/lib/narrative-world-store"

export const metadata: Metadata = {
  title: "Worlds — PHASE Protocol",
  description:
    "Narrative universes built on PHASE. Each collection is a world. Each mint expands the story.",
  openGraph: {
    title: "PHASE Worlds",
    description: "Narrative universes on Stellar Soroban.",
  },
}

const navLink =
  "inline-flex min-h-[36px] items-center border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 transition-colors hover:border-violet-500/50 hover:text-violet-300"

type WorldEntry = {
  collectionId: number
  data: WorldCollectionData
  narrativeCount: number
  latestNarrative: WorldNarrativeData | null
}

export default async function WorldHubPage() {
  const store = await getAllWorldCollections()

  const worlds: WorldEntry[] = await Promise.all(
    Object.entries(store).map(async ([id, data]) => {
      const narratives = await getRecentNarrativesForCollection(Number(id), 50)
      return {
        collectionId: Number(id),
        data,
        narrativeCount: narratives.length,
        latestNarrative: narratives[0] ?? null,
      }
    }),
  )

  worlds.sort((a, b) => b.collectionId - a.collectionId)

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <div className="grid-bg pointer-events-none fixed inset-0 opacity-40" aria-hidden />

      {/* Header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-violet-800/40 bg-zinc-950/90 px-4 py-3 backdrop-blur-sm md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className={navLink}>← Home</Link>
          <Link href="/explore" className={navLink}>Explore</Link>
        </div>
        <span className="text-center text-[10px] font-bold uppercase tracking-[0.28em] text-violet-200">
          ◈ PHASE · WORLDS
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <LangToggle variant="phosphor" />
          <Link href="/forge" className={navLink}>Forge</Link>
          <Link href="/chamber" className={navLink}>Chamber</Link>
          <Link href="/dashboard" className={navLink}>Market</Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 md:py-12">
        <div className="border-4 border-double border-violet-400/55 bg-[oklch(0.05_0_0)] shadow-[0_0_32px_rgba(139,92,246,0.06)]">

          {/* Title bar */}
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-violet-400/30 px-6 py-5 md:px-8">
            <div>
              <h1 className="text-[13px] font-bold uppercase tracking-[0.28em] text-violet-200">
                ◈ NARRATIVE_WORLDS
              </h1>
              <p className="mt-1.5 max-w-xl text-[10px] leading-relaxed text-violet-300/70">
                Collections with active narrative worlds. Each mint expands the story.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <p className="text-[9px] uppercase tracking-[0.22em] text-violet-500/60">
                WORLDS ACTIVE
              </p>
              <p className="text-[22px] font-bold leading-none tracking-tight text-violet-300">
                {worlds.length}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 md:p-8">
            {worlds.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-20">
                <p className="text-[10px] uppercase tracking-widest text-violet-500/60">
                  [ NO_WORLDS_ACTIVE ]
                </p>
                <p className="max-w-sm text-center text-[10px] leading-relaxed text-violet-400/50">
                  No collections have activated a narrative world yet. Create one in the Forge.
                </p>
                <Link href="/forge" className={navLink}>
                  Open Forge
                </Link>
              </div>
            ) : (
              <ul
                className="grid gap-4"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
              >
                {worlds.map((w) => (
                  <WorldCard key={w.collectionId} {...w} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function WorldCard({ collectionId, data, narrativeCount, latestNarrative }: WorldEntry) {
  return (
    <li className="list-none">
      <Link
        href={`/world/${collectionId}`}
        className="group flex h-full flex-col gap-3 border border-violet-500/30 bg-black/50 p-4 transition-all duration-200 hover:border-violet-400/60 hover:shadow-[0_0_20px_rgba(139,92,246,0.10)]"
      >
        {/* Badge */}
        <span className="w-fit border border-violet-400/50 bg-violet-950/50 px-2 py-0.5 text-[8px] uppercase tracking-widest text-violet-300">
          [ WORLD_ACTIVE ]
        </span>

        {/* World name */}
        <p className="text-[16px] font-medium tracking-wide text-violet-100 transition-colors group-hover:text-violet-50">
          {data.world_name}
        </p>

        {/* World prompt truncated */}
        <p className="text-[12px] leading-relaxed text-violet-300/60">
          {data.world_prompt.length > 120
            ? `${data.world_prompt.slice(0, 120)}…`
            : data.world_prompt}
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.15em] text-violet-500/70">
          <span>COLLECTION · #{collectionId}</span>
          <span>NARRATIVES · {narrativeCount}</span>
        </div>

        {/* Latest narrative */}
        {latestNarrative && (
          <div className="border-l-2 border-violet-400/40 pl-3">
            <p className="line-clamp-3 text-[11px] italic leading-relaxed text-violet-200/70">
              {latestNarrative.narrative}
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto pt-2">
          <span className="inline-flex items-center gap-1.5 border border-violet-500/40 bg-violet-950/30 px-3 py-1.5 text-[9px] uppercase tracking-widest text-violet-300 transition-colors group-hover:border-violet-400/60 group-hover:bg-violet-900/30 group-hover:text-violet-100">
            [ ENTER_WORLD ]
          </span>
        </div>
      </Link>
    </li>
  )
}
