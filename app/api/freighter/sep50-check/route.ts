import { NextResponse, type NextRequest } from "next/server"
import { extractBaseAddress, StrKey } from "@stellar/stellar-sdk"
import {
  fetchNftCollectionName,
  fetchNftCollectionSymbol,
  fetchTokenOwnerAddress,
  fetchTokenUriString,
  phaseProtocolContractIdForServer,
} from "@/lib/phase-protocol"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const contractParam = request.nextUrl.searchParams.get("contract")?.trim()
  const tokenParam = request.nextUrl.searchParams.get("tokenId")?.trim()

  let contractId: string
  try {
    contractId =
      contractParam && StrKey.isValidContract(contractParam)
        ? contractParam
        : phaseProtocolContractIdForServer()
  } catch {
    return NextResponse.json({ ok: false, error: "contract_config" }, { status: 500 })
  }

  const tokenId = tokenParam ? parseInt(tokenParam, 10) : NaN
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_token_id" }, { status: 400 })
  }

  const checks: Record<string, { ok: boolean; detail?: string }> = {}

  const name = await fetchNftCollectionName(contractId)
  checks.name = { ok: Boolean(name && name.length > 0), detail: name ?? undefined }

  const symbol = await fetchNftCollectionSymbol(contractId)
  checks.symbol = { ok: Boolean(symbol && symbol.length > 0), detail: symbol ?? undefined }

  const ownerRaw = await fetchTokenOwnerAddress(contractId, tokenId)
  const ownerG = ownerRaw ? extractBaseAddress(ownerRaw).trim() : ""
  checks.owner_of = {
    ok: Boolean(ownerG && StrKey.isValidEd25519PublicKey(ownerG)),
    detail: ownerG || (ownerRaw ? ownerRaw : "simulation_failed_or_invalid_token"),
  }

  const uri = await fetchTokenUriString(tokenId, contractId)
  const uriTrim = uri?.trim() ?? ""
  const httpsOk = /^https:\/\//i.test(uriTrim)
  checks.token_uri_https = { ok: httpsOk, detail: uriTrim || undefined }

  let metadataJsonOk = false
  let metadataDetail = ""
  if (httpsOk && uriTrim) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 12_000)
      const r = await fetch(uriTrim, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      })
      clearTimeout(t)
      if (!r.ok) metadataDetail = `http_${r.status}`
      else {
        const j = (await r.json()) as { name?: unknown; description?: unknown; image?: unknown }
        metadataJsonOk =
          typeof j.name === "string" &&
          typeof j.description === "string" &&
          typeof j.image === "string" &&
          j.name.length > 0 &&
          j.image.length > 0
        metadataDetail = metadataJsonOk ? "ok" : "missing_name_description_or_image"
      }
    } catch (e) {
      metadataDetail = e instanceof Error ? e.message : "fetch_failed"
    }
  } else {
    metadataDetail = httpsOk ? "" : "no_https_uri"
  }
  checks.metadata_json = { ok: metadataJsonOk, detail: metadataDetail || undefined }

  const sep50Ready = Object.values(checks).every((c) => c.ok)

  return NextResponse.json(
    {
      ok: true,
      sep50Ready,
      contractId,
      tokenId,
      checks,
      freighterNote:
        "Freighter lists SEP-50 collectibles in-app using its own backend; it does not call this API. This check verifies on-chain + metadata alignment with SEP-0050 (draft) so Add manually and indexers behave correctly.",
      references: [
        "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0050.md",
        "https://docs.freighter.app/docs/whatsnew/",
      ],
    },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    },
  )
}
