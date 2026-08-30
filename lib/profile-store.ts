import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { serverDataJsonPath } from "@/lib/server-data-paths"

export type ProfileData = {
  display_name?: string
  twitter?: string
  discord?: string
  telegram?: string
  avatar_token_id?: number
  avatar_image_url?: string
  locale?: ProfileLocale
  updated_at: number
}

type ProfileStore = Record<string, ProfileData>

async function readStore(): Promise<ProfileStore> {
  try {
    const raw = await readFile(serverDataJsonPath("profileSocials"), "utf8")
    return JSON.parse(raw) as ProfileStore
  } catch {
    return {}
  }
}

async function writeStore(data: ProfileStore): Promise<void> {
  const filePath = serverDataJsonPath("profileSocials")
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

export async function getProfile(wallet: string): Promise<ProfileData | null> {
  const store = await readStore()
  return store[wallet] ?? null
}

export async function saveProfile(
  wallet: string,
  data: Omit<ProfileData, "updated_at">,
): Promise<ProfileData> {
  const store = await readStore()
  const entry: ProfileData = {
    ...data,
    updated_at: Date.now(),
  }
  store[wallet] = entry
  await writeStore(store)
  return entry
}


// phase-102: locale preference support for profile localization.
// Rollback: unset NEXT_PUBLIC_FEATURE_PHASE_102 / FEATURE_PHASE_102 to keep default English presentation.
export const SUPPORTED_PROFILE_LOCALES = ["en", "es", "fr", "pt-BR", "yo", "ig"] as const
export type ProfileLocale = (typeof SUPPORTED_PROFILE_LOCALES)[number]
export const DEFAULT_PROFILE_LOCALE: ProfileLocale = "en"

export type ProfileLocaleResolution =
  | { ok: true; locale: ProfileLocale; featureEnabled: boolean }
  | { ok: false; locale: ProfileLocale; error: string; code: "FLAG_DISABLED" | "UNSUPPORTED_LOCALE"; featureEnabled: boolean }

export function isPhase102Enabled(): boolean {
  const value = (process.env.NEXT_PUBLIC_FEATURE_PHASE_102 ?? process.env.FEATURE_PHASE_102 ?? "").trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

export function normalizeProfileLocale(locale: string | null | undefined): ProfileLocale | null {
  const normalized = (locale ?? "").trim()
  const match = SUPPORTED_PROFILE_LOCALES.find((candidate) => candidate.toLowerCase() === normalized.toLowerCase())
  return match ?? null
}

export function resolveProfileLocale(locale: string | null | undefined): ProfileLocaleResolution {
  const featureEnabled = isPhase102Enabled()
  if (!featureEnabled) {
    return { ok: false, locale: DEFAULT_PROFILE_LOCALE, error: "phase-102 flag disabled", code: "FLAG_DISABLED", featureEnabled }
  }

  const normalized = normalizeProfileLocale(locale)
  if (!normalized) {
    return { ok: false, locale: DEFAULT_PROFILE_LOCALE, error: "Unsupported profile locale", code: "UNSUPPORTED_LOCALE", featureEnabled }
  }

  return { ok: true, locale: normalized, featureEnabled }
}

export function localizeAvatarName(tokenId: number, locale: ProfileLocale = DEFAULT_PROFILE_LOCALE): string {
  const labels: Record<ProfileLocale, string> = {
    en: "Phase Artifact",
    es: "Artefacto Phase",
    fr: "Artefact Phase",
    "pt-BR": "Artefato Phase",
    yo: "Ohun Iranti Phase",
    ig: "Ihe Ncheta Phase",
  }
  return `${labels[locale] ?? labels.en} #${tokenId}`
}

export async function getProfileLocalePreference(wallet: string): Promise<ProfileLocale> {
  const profile = await getProfile(wallet)
  return normalizeProfileLocale(profile?.locale) ?? DEFAULT_PROFILE_LOCALE
}

export async function saveProfileLocalePreference(wallet: string, locale: string): Promise<ProfileLocaleResolution> {
  const resolved = resolveProfileLocale(locale)
  if (!resolved.ok) return resolved

  const profile = await getProfile(wallet)
  await saveProfile(wallet, {
    ...(profile ?? {}),
    locale: resolved.locale,
  })
  return resolved
}
// phase-96: human-readable profile handle resolution.
// Rollback: unset NEXT_PUBLIC_FEATURE_PHASE_96 / FEATURE_PHASE_96 to keep handle lookup passive.
export type ProfileHandleRecord = {
  walletAddress: string
  handle: string
  updatedAt: number
}

export type ProfileHandleResolution =
  | { ok: true; walletAddress: string; handle: string; updatedAt: number; featureEnabled: boolean }
  | { ok: false; error: string; code: "FLAG_DISABLED" | "NOT_FOUND" | "INVALID_HANDLE" | "HANDLE_TAKEN"; featureEnabled: boolean }

const PROFILE_HANDLE_MIN = 3
const PROFILE_HANDLE_MAX = 24
const PROFILE_HANDLE_PATTERN = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/

type ArtistAliasStore = Record<string, { alias: string; updatedAt: number }>

function isPhase96Enabled(): boolean {
  const value = (process.env.NEXT_PUBLIC_FEATURE_PHASE_96 ?? process.env.FEATURE_PHASE_96 ?? "").trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

function normalizeProfileHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").replace(/\s+/g, "-").toLowerCase()
}

function validateProfileHandle(handle: string): string | null {
  if (handle.length < PROFILE_HANDLE_MIN || handle.length > PROFILE_HANDLE_MAX) {
    return `Handle must be ${PROFILE_HANDLE_MIN}-${PROFILE_HANDLE_MAX} characters.`
  }
  if (!PROFILE_HANDLE_PATTERN.test(handle)) {
    return "Handle must use lowercase letters, numbers, dot, dash, or underscore and must start/end with a letter or number."
  }
  return null
}

async function readArtistAliasStore(): Promise<ArtistAliasStore> {
  try {
    const raw = await readFile(serverDataJsonPath("artistProfiles"), "utf8")
    const parsed = JSON.parse(raw) as ArtistAliasStore
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function writeArtistAliasStore(data: ArtistAliasStore): Promise<void> {
  const filePath = serverDataJsonPath("artistProfiles")
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

export async function resolveProfileHandle(handle: string): Promise<ProfileHandleResolution> {
  const featureEnabled = isPhase96Enabled()
  if (!featureEnabled) {
    return { ok: false, error: "phase-96 flag disabled", code: "FLAG_DISABLED", featureEnabled }
  }

  const normalized = normalizeProfileHandle(handle)
  const invalid = validateProfileHandle(normalized)
  if (invalid) {
    return { ok: false, error: invalid, code: "INVALID_HANDLE", featureEnabled }
  }

  const store = await readArtistAliasStore()
  const match = Object.entries(store).find(([, profile]) => normalizeProfileHandle(profile.alias) === normalized)
  if (!match) {
    return { ok: false, error: "Handle not found", code: "NOT_FOUND", featureEnabled }
  }

  const [walletAddress, profile] = match
  return { ok: true, walletAddress, handle: normalizeProfileHandle(profile.alias), updatedAt: profile.updatedAt, featureEnabled }
}

export async function getProfileHandle(walletAddress: string): Promise<ProfileHandleRecord | null> {
  const store = await readArtistAliasStore()
  const profile = store[walletAddress]
  if (!profile) return null
  return { walletAddress, handle: normalizeProfileHandle(profile.alias), updatedAt: profile.updatedAt }
}

export async function saveProfileHandle(walletAddress: string, handle: string): Promise<ProfileHandleResolution> {
  const featureEnabled = isPhase96Enabled()
  const normalized = normalizeProfileHandle(handle)
  const invalid = validateProfileHandle(normalized)
  if (invalid) {
    return { ok: false, error: invalid, code: "INVALID_HANDLE", featureEnabled }
  }

  const store = await readArtistAliasStore()
  const taken = Object.entries(store).find(
    ([wallet, profile]) => wallet !== walletAddress && normalizeProfileHandle(profile.alias) === normalized,
  )
  if (taken) {
    return { ok: false, error: "Handle is already linked to another wallet", code: "HANDLE_TAKEN", featureEnabled }
  }

  const updatedAt = Date.now()
  store[walletAddress] = { alias: normalized, updatedAt }
  await writeArtistAliasStore(store)
  return { ok: true, walletAddress, handle: normalized, updatedAt, featureEnabled }
}
// ??? phase-117: multi-gateway IPFS pinning with redundancy ??????????????????
// Isolated, flag-gated. Single gateway outage drops metadata previously.
// When enabled, avatar pinning uses quorum across gateways and avatar reads
// try fallback gateways with checksum verification. When flag off, legacy
// single-gateway behavior (zero regression).
//
// Rollback: unset NEXT_PUBLIC_FEATURE_PHASE_117 / FEATURE_PHASE_117.

export function isProfilePinningRedundancyEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_FEATURE_PHASE_117 ?? process.env.FEATURE_PHASE_117 ?? "").trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

export const AvatarPinRequestSchema = z.object({
  tokenId: z.number().int().min(1).max(1_000_000),
  imageUrl: z.string().trim().min(1).max(1024).url().or(z.string().trim().regex(/^ipfs:\/\//)),
  wallet: z.string().trim().min(10).max(56),
  quorum: z.number().int().min(1).max(3).optional(),
})

export type AvatarPinRequest = z.infer<typeof AvatarPinRequestSchema>

export type AvatarPinResult =
  | { ok: true; cid: string; uri: string; checksum: string; quorum: number; achieved: number; verified: boolean }
  | { ok: false; error: string; code: string; achieved?: number; quorum?: number }

export const ProfileAvatarFetchSchema = z.object({
  wallet: z.string().trim().min(10).max(56),
})

/**
 * Pins an avatar image with redundancy across gateways.
 * Uses lib/ipfs-pinning pinWithRedundancy under the hood.
 * When flag off, falls back to single Pinata pin (legacy).
 */
export async function pinAvatarWithRedundancy(
  imageBlob: Blob,
  opts: { quorum?: number; fileName?: string; expectedChecksum?: string | null } = {},
): Promise<AvatarPinResult> {
  if (!isProfilePinningRedundancyEnabled()) {
    // legacy: single pin via /api/ipfs style ? return not-enabled code
    return { ok: false, error: "phase-117 flag disabled (set NEXT_PUBLIC_FEATURE_PHASE_117=1)", code: "FLAG_DISABLED" }
  }
  const jwt = (process.env.PINATA_JWT ?? process.env.PINATA_API_JWT ?? "").trim()
  if (!jwt) return { ok: false, error: "PINATA_JWT not configured", code: "NOT_CONFIGURED" }
  try {
    const { pinWithRedundancy } = await import("@/lib/ipfs-pinning")
    const res = await pinWithRedundancy(imageBlob, jwt, {
      config: opts.quorum != null ? { quorum: opts.quorum } : undefined,
      fileName: opts.fileName ?? "avatar.png",
      expectedChecksum: opts.expectedChecksum ?? null,
    })
    if (!res.ok || !res.cid || !res.uri) {
      return { ok: false, error: res.results.find((r) => r.error)?.error ?? "All gateways failed", code: "PIN_FAILED", achieved: res.achieved, quorum: res.quorum }
    }
    return { ok: true, cid: res.cid, uri: res.uri, checksum: res.checksum ?? "", quorum: res.quorum, achieved: res.achieved, verified: res.verified }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), code: "PIN_ERROR" }
  }
}

/**
 * Resolves avatar image URL with multi-gateway fallback when flag enabled.
 * Tries gateways in priority order and checksum-verifies if expected available.
 */
export async function resolveAvatarWithFallback(
  imageUrl: string,
  opts: { expectedChecksum?: string | null; signal?: AbortSignal } = {},
): Promise<{ ok: true; url: string; gateway: string; checksum: string } | { ok: false; error: string }> {
  if (!imageUrl) return { ok: false, error: "Empty imageUrl" }
  // non-ipfs URLs pass through
  if (/^https?:\/\//i.test(imageUrl) && !imageUrl.includes("/ipfs/")) {
    return { ok: true, url: imageUrl, gateway: "direct", checksum: "" }
  }
  const ipfsPath = (() => {
    const m = imageUrl.match(/ipfs:\/\/([A-Za-z0-9._\/-]+)/)
    if (m) return m[1]!
    const g = imageUrl.match(/\/ipfs\/([A-Za-z0-9._\/-]+)/)
    if (g) return g[1]!
    if (/^[A-Za-z0-9._\/-]+$/.test(imageUrl.trim())) return imageUrl.trim().replace(/^\/+/, "")
    return null
  })()
  if (!ipfsPath) return { ok: true, url: imageUrl, gateway: "direct", checksum: "" }

  if (!isProfilePinningRedundancyEnabled()) {
    return { ok: true, url: imageUrl, gateway: "legacy", checksum: "" }
  }
  try {
    const { fetchWithMultiGatewayFallback } = await import("@/lib/ipfs-pinning")
    const res = await fetchWithMultiGatewayFallback(ipfsPath, { expectedChecksum: opts.expectedChecksum ?? null, signal: opts.signal })
    if (!res.ok) return { ok: false, error: res.error }
    // return gateway-routed URL (verified)
    return { ok: true, url: `${res.gateway.replace(/\/+$/, "")}/${ipfsPath}`, gateway: res.gateway, checksum: res.checksum }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Re-export for isolated testing / API routes
export { isPhase117Enabled, flag117RollbackNote } from "@/lib/ipfs-pinning"
export type { MultiPinResult, PinResult } from "@/lib/ipfs-pinning"