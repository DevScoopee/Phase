import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
  buildPhaseTokenMetadataJson,
  publicPhaseSiteBaseUrl,
} from "@/lib/phase-nft-metadata-build"
import {
  phaseProtocolContractIdForServer,
  fetchTokenOwnerAddress,
} from "@/lib/phase-protocol"
import { CrtCollectionPreview } from "@/components/crt-collection-preview"

type Props = {
  params: Promise<{ id: string }>
}

function resolveContractId(): string | null {
  try {
    return phaseProtocolContractIdForServer()
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const tokenId = parseInt(id, 10)

  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return { title: "Not Found" }
  }

  const contractId = resolveContractId()
  if (!contractId) return { title: "PHASE Archive" }

  const nft = await buildPhaseTokenMetadataJson(contractId, tokenId)
  if (!nft) return { title: "Not Found" }

  const base = publicPhaseSiteBaseUrl()
  const pageUrl = `${base}/collection/${id}`

  return {
    title: nft.name,
    description: nft.description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: nft.name,
      description: nft.description,
      url: pageUrl,
      type: "website",
      images: [
        {
          url: nft.image,
          width: 1024,
          height: 1024,
          alt: nft.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: nft.name,
      description: nft.description,
      images: [nft.image],
    },
  }
}

export default async function CollectionPreviewPage({ params }: Props) {
  const { id } = await params
  const tokenId = parseInt(id, 10)

  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    notFound()
  }

  const contractId = resolveContractId()
  if (!contractId) notFound()

  const [nft, owner] = await Promise.all([
    buildPhaseTokenMetadataJson(contractId, tokenId),
    fetchTokenOwnerAddress(contractId, tokenId),
  ])

  if (!nft) notFound()

  return (
    <CrtCollectionPreview
      tokenId={tokenId}
      name={nft.name}
      description={nft.description}
      image={nft.image}
      attributes={nft.attributes}
      collectionId={nft.collectionId}
      owner={owner ?? null}
    />
  )
}
