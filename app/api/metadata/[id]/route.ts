import { NextResponse, type NextRequest } from "next/server"
import {
  fetchCollectionInfo,
  fetchPhaseLevelForToken,
  fetchTokenCollectionIdForToken,
  fetchTokenOwnerAddress,
  ipfsOrHttpsDisplayUrl,
  phaseProtocolContractIdForServer,
} from "@/lib/phase-protocol"

export const dynamic = "force-dynamic"

function publicSiteBaseUrl(): string {
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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const tokenId = parseInt(id, 10)
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }

  const contractId = phaseProtocolContractIdForServer()
  const owner = await fetchTokenOwnerAddress(contractId, tokenId)
  if (!owner) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  const base = publicSiteBaseUrl()
  const colId = await fetchTokenCollectionIdForToken(tokenId, owner)
  const phaseLevel = await fetchPhaseLevelForToken(tokenId)

  let collectionName = "Phase"
  let imageRaw = ""
  if (colId != null && colId > 0) {
    const info = await fetchCollectionInfo(colId)
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
      ? `Forged via x402 on Soroban · PHASE level ${phaseLevel}`
      : "Forged via x402 on Soroban"

  return NextResponse.json(
    { name, description, image },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  )
}
