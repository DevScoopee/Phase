import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getProfile } from "@/lib/profile-store"

type Props = {
  params: Promise<{ wallet: string }>
}

function truncate(addr: string) {
  if (!addr || addr.length < 14) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

async function fetchNfts(wallet: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
    const res = await fetch(
      `${baseUrl}/api/wallet/phase-nfts?address=${encodeURIComponent(wallet)}`,
      { next: { revalidate: 60 } },
    )
    if (!res.ok) return []
    const json = (await res.json()) as {
      items?: { tokenId: number; name: string; image?: string; collectionId?: number }[]
    }
    return json.items ?? []
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params
  const profile = await getProfile(wallet)
  const name = profile?.display_name ?? truncate(wallet)

  return {
    title: `${name} — PHASE`,
    description: `Profile of ${name} on PHASE. NFT artifacts, worlds, and rewards.`,
    openGraph: {
      title: `${name} on PHASE`,
      description: `View ${name}'s artifacts and worlds on PHASE.`,
      images: [
        {
          url: `/api/og/profile?wallet=${encodeURIComponent(wallet)}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} on PHASE`,
      description: `View ${name}'s artifacts and worlds on PHASE.`,
      images: [`/api/og/profile?wallet=${encodeURIComponent(wallet)}`],
    },
  }
}

export default async function ProfilePage({ params }: Props) {
  const { wallet } = await params

  if (!wallet || wallet.length < 10) notFound()

  const [profile, nfts] = await Promise.all([getProfile(wallet), fetchNfts(wallet)])

  const displayName = profile?.display_name ?? truncate(wallet)

  return (
    <main className="min-h-screen bg-zinc-950 text-violet-100 px-4 py-16 font-mono">
      <div className="mx-auto max-w-2xl space-y-10">

        {/* Identity */}
        <section className="space-y-2">
          <h1 className="text-lg font-bold uppercase tracking-widest text-violet-300">
            {displayName}
          </h1>
          <p className="text-[10px] text-zinc-600 tracking-widest break-all">{wallet}</p>

          {/* Social handles */}
          {(profile?.twitter || profile?.discord || profile?.telegram) && (
            <div className="flex flex-wrap gap-4 pt-1">
              {profile.twitter && (
                <span className="text-[9px] uppercase tracking-widest text-zinc-500">
                  𝕏 {profile.twitter}
                </span>
              )}
              {profile.discord && (
                <span className="text-[9px] uppercase tracking-widest text-zinc-500">
                  DC {profile.discord}
                </span>
              )}
              {profile.telegram && (
                <span className="text-[9px] uppercase tracking-widest text-zinc-500">
                  TG {profile.telegram}
                </span>
              )}
            </div>
          )}
        </section>

        {/* Artifact grid */}
        <section className="space-y-3">
          <h2 className="text-[9px] uppercase tracking-widest text-zinc-600 border-b border-violet-800/20 pb-1">
            ARTIFACTS — {nfts.length}
          </h2>

          {nfts.length === 0 ? (
            <p className="text-[9px] text-zinc-700">No artifacts minted yet.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {nfts.map((nft) => (
                <div
                  key={nft.tokenId}
                  className="aspect-square overflow-hidden rounded-sm border border-violet-800/20 bg-zinc-900"
                  title={nft.name}
                >
                  {nft.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={nft.image}
                      alt={nft.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <span className="text-[8px] text-zinc-700">#{nft.tokenId}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Back link */}
        <a
          href="/"
          className="inline-block text-[9px] uppercase tracking-widest text-zinc-700 hover:text-violet-400 transition-colors"
        >
          ← PHASE
        </a>
      </div>
    </main>
  )
}
