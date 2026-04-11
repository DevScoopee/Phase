import {
  fetchCollectionInfo,
  fetchPhaseLevelForToken,
  fetchTokenCollectionIdForToken,
  fetchTokenOwnerAddress,
  ipfsOrHttpsDisplayUrl,
} from "@/lib/phase-protocol"

export function publicPhaseSiteBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, "")
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`
  return "https://www.phasee.xyz"
}

function defaultCollectionImage(base: string): string {
  const og = process.env.NEXT_PUBLIC_OG_IMAGE_URL?.trim()
  if (og && /^https?:\/\//i.test(og)) return og
  return `${base}/og-phase.png`
}

function resolvePublicImageUri(raw: string, base: string): string {
  const t = raw.trim()
  if (!t) return defaultCollectionImage(base)
  if (t.startsWith("/")) return `${base}${t}`
  return ipfsOrHttpsDisplayUrl(t)
}

export type PhaseTokenMetadataJson = {
  name: string
  description: string
  image: string
  external_url: string
  attributes: Array<{
    trait_type: string
    value: string | number
    display_type?: "number"
  }>
  collectionId: number | null
}

/**
 * Misma lógica que GET /api/metadata/[id]: JSON estilo OpenSea + id de colección resuelto on-chain.
 */
export async function buildPhaseTokenMetadataJson(
  contractId: string,
  tokenId: number,
): Promise<PhaseTokenMetadataJson | null> {
  const owner = await fetchTokenOwnerAddress(contractId, tokenId)
  if (!owner) return null

  const base = publicPhaseSiteBaseUrl()
  const colId = await fetchTokenCollectionIdForToken(tokenId, owner, contractId)
  const phaseLevel = await fetchPhaseLevelForToken(tokenId, contractId)

  let collectionName = "Phase"
  let imageRaw = ""
  if (colId != null && colId > 0) {
    const info = await fetchCollectionInfo(colId, contractId)
    if (info?.name?.trim()) collectionName = info.name.trim()
    imageRaw = info?.imageUri?.trim() ?? ""
  }

  const image = resolvePublicImageUri(imageRaw, base)
  const name =
    colId != null && colId > 0
      ? `${collectionName} Artifact #${tokenId}`
      : `Phase Artifact #${tokenId}`

  const description =
    phaseLevel && phaseLevel.length > 0
      ? `Forged on Soroban via x402 AI Protocol · PHASE level ${phaseLevel}`
      : "Forged on Soroban via x402 AI Protocol"

  return {
    name,
    description,
    image,
    external_url: `${base}/chamber${colId != null && colId > 0 ? `?collection=${colId}` : ""}`,
    attributes: [
      ...(colId != null && colId > 0
        ? [{ trait_type: "collection_id", value: colId, display_type: "number" as const }]
        : []),
      { trait_type: "token_id", value: tokenId, display_type: "number" as const },
      ...(phaseLevel && phaseLevel.length > 0 ? [{ trait_type: "phase_level", value: phaseLevel }] : []),
      { trait_type: "network", value: "stellar-testnet" },
      { trait_type: "standard", value: "SEP-50-draft" },
    ],
    collectionId: colId != null && Number.isFinite(colId) ? colId : null,
  }
}
