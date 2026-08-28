import {
  fetchCollectionInfo,
  fetchPhaseLevelForToken,
  fetchTokenCollectionIdForToken,
  fetchTokenOwnerAddress,
  extractIpfsGatewaySubpath,
} from "@/lib/phase-protocol"
import { z } from "zod"

// ── phase-123: IPFS timeout fallback chain (isolated, flag-gated) ──
// One slow gateway stalls the whole read. This module provides per-gateway
// timeout + fallback chain. Used by /api/ipfs and metadata build.
// Flag: NEXT_PUBLIC_FEATURE_PHASE_123 / FEATURE_PHASE_123 — rollback: unset flag.

function isPhase123Enabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_FEATURE_PHASE_123 ?? process.env.FEATURE_PHASE_123 ?? "").trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

export const PHASE_IPFS_GATEWAYS = [
  "https://w3s.link/ipfs",
  "https://dweb.link/ipfs",
  "https://ipfs.io/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
] as const

export const IpfsFallbackConfigSchema = z.object({
  gateways: z.array(z.string().url()).min(1).max(8).default([...PHASE_IPFS_GATEWAYS]),
  timeoutMs: z.number().int().min(500).max(15000).default(4000),
  retries: z.number().int().min(0).max(2).default(0),
})

export type IpfsFallbackConfig = z.infer<typeof IpfsFallbackConfigSchema>

export type IpfsFallbackResult =
  | { ok: true; gateway: string; bytes: ArrayBuffer; contentType: string; latencyMs: number }
  | { ok: false; error: string; perGateway: Array<{ gateway: string; error: string; latencyMs: number }> }

export function resolveIpfsFallbackConfig(overrides: Partial<IpfsFallbackConfig> = {}): IpfsFallbackConfig {
  const parsed = IpfsFallbackConfigSchema.safeParse({
    gateways: overrides.gateways ?? [...PHASE_IPFS_GATEWAYS],
    timeoutMs: overrides.timeoutMs ?? (isPhase123Enabled() ? 4000 : 8000),
    retries: overrides.retries ?? 0,
  })
  if (!parsed.success) return { gateways: [...PHASE_IPFS_GATEWAYS], timeoutMs: 4000, retries: 0 }
  return parsed.data
}

export async function fetchWithIpfsFallback(ipfsPath: string, opts: { config?: Partial<IpfsFallbackConfig>; signal?: AbortSignal } = {}): Promise<IpfsFallbackResult> {
  const clean = ipfsPath.replace(/^\/+/, "").trim()
  if (!clean) return { ok: false, error: "Empty IPFS path", perGateway: [] }
  const cfg = resolveIpfsFallbackConfig(opts.config)
  const perGateway: Array<{ gateway: string; error: string; latencyMs: number }> = []

  for (const base of cfg.gateways) {
    const url = `${base.replace(/\/+$/, "")}/${clean}`
    const start = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException(`Timeout ${cfg.timeoutMs}ms`, "TimeoutError")), cfg.timeoutMs)
    if (opts.signal) {
      const sig = opts.signal
      if (sig.aborted) controller.abort((sig as AbortSignal & { reason?: unknown }).reason)
      else sig.addEventListener("abort", () => controller.abort((sig as AbortSignal & { reason?: unknown }).reason), { once: true })
    }
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: "*/*" }, cache: "no-store" as RequestCache })
      clearTimeout(timer)
      const latencyMs = Date.now() - start
      if (!res.ok) {
        perGateway.push({ gateway: base, error: `HTTP ${res.status}`, latencyMs })
        continue
      }
      const contentType = res.headers.get("content-type") ?? "application/octet-stream"
      const bytes = await res.arrayBuffer()
      // Record to gateway-health if flag 121 enabled (best-effort)
      try {
        const { recordGatewayLatency } = await import("@/lib/gateway-health")
        recordGatewayLatency(base, latencyMs, true)
      } catch { /* ignore */ }
      return { ok: true, gateway: base, bytes, contentType, latencyMs }
    } catch (e) {
      clearTimeout(timer)
      const latencyMs = Date.now() - start
      const msg = e instanceof Error ? e.message : String(e)
      const isTimeout = msg.toLowerCase().includes("timeout") || (e as DOMException)?.name === "TimeoutError"
      perGateway.push({ gateway: base, error: isTimeout ? `timeout@${cfg.timeoutMs}ms` : msg.slice(0, 200), latencyMs })
      try {
        const { recordGatewayLatency } = await import("@/lib/gateway-health")
        recordGatewayLatency(base, latencyMs, false)
      } catch { /* ignore */ }
      if (opts.signal?.aborted) return { ok: false, error: `Aborted: ${msg}`, perGateway }
    }
  }
  return { ok: false, error: "All IPFS gateways failed", perGateway }
}

export const PhaseMetadataRequestSchema = z.object({
  contractId: z.string().length(56).regex(/^C[A-Z2-7]{55}$/, "Invalid contract strkey"),
  tokenId: z.number().int().min(1).max(1_000_000),
})

export class IpfsFallbackError extends Error {
  code: "TIMEOUT" | "ALL_GATEWAYS_FAILED" | "VALIDATION_FAILED"
  constructor(code: IpfsFallbackError["code"], message: string) {
    super(message)
    this.name = "IpfsFallbackError"
    this.code = code
  }
}

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
  // For IPFS URIs, proxy through our own server so Freighter (browser extension)
  // can load the image without CORS issues and with gateway retry logic.
  const ipfsPath = extractIpfsGatewaySubpath(t)
  if (ipfsPath) return `${base}/api/ipfs/${ipfsPath}`
  return t
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
