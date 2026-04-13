import type { Metadata } from "next"
import { Suspense } from "react"
import { ChamberBootFallback } from "@/components/chamber-boot-fallback"
import { FusionChamber } from "@/components/fusion-chamber"
import { fetchCollectionInfo } from "@/lib/phase-protocol"
import { publicPhaseSiteBaseUrl } from "@/lib/phase-nft-metadata-build"
import { getWorldForCollection } from "@/lib/narrative-world-store"

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}


export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const base = publicPhaseSiteBaseUrl()
  const params = await searchParams
  const rawCollection = params.collection
  const collectionId = typeof rawCollection === "string" ? parseInt(rawCollection, 10) : NaN

  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    return {
      title: "Chamber | P H A S E",
    }
  }

  const [collection, world] = await Promise.all([
    fetchCollectionInfo(collectionId).catch(() => null),
    getWorldForCollection(collectionId).catch(() => null),
  ])

  if (!collection) {
    return { title: "Chamber | P H A S E" }
  }

  const title = world?.world_name
    ? `${collection.name} — ${world.world_name}`
    : collection.name

  const description = world?.world_prompt
    ? world.world_prompt.slice(0, 160)
    : `PHASE Protocol artifact — collection #${collectionId} on Soroban testnet.`

  const ogImage = `${base}/api/og/chamber?collection=${collectionId}`
  const pageUrl = `${base}/chamber?collection=${collectionId}`

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  }
}

export default function ChamberPage() {
  return (
    <Suspense fallback={<ChamberBootFallback />}>
      <FusionChamber />
    </Suspense>
  )
}
