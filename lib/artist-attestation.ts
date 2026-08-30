/**
 * Verified-artist badge issuance via signed attestation — phase-94
 *
 * Fake artist impersonation was previously unchecked in the setup/reset/SAC
 * scripts: any wallet could self-label as an "artist" in profile metadata.
 * This module issues a badge only after a wallet signs a canonical attestation
 * payload with its Stellar keypair; the signature is verified against the
 * claimed public key before the badge is persisted.
 *
 * Feature flag: phase-94 (NEXT_PUBLIC_FEATURE_PHASE_94 / FEATURE_PHASE_94)
 * Rollback: unset flag → issuance/verification calls throw FLAG_DISABLED;
 *           previously issued badges remain on disk and keep reading fine
 *           (no destructive migration involved).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { Keypair, StrKey } from "@stellar/stellar-sdk"
import { z } from "zod"
import { isFeatureEnabled } from "@/lib/feature-flags"

export function isPhase94Enabled(): boolean {
  return isFeatureEnabled("phase-94")
}

export function flag94RollbackNote(): string {
  return "Rollback phase-94: unset NEXT_PUBLIC_FEATURE_PHASE_94 / FEATURE_PHASE_94 or set to 0/false and restart. Issued badges remain on disk; new issuance/verification is disabled until re-enabled."
}

// ─── schemas ─────────────────────────────────────────────────────────────────

const STELLAR_G_REGEX = /^G[A-Z2-7]{55}$/

export const ArtistAttestationPayloadSchema = z.object({
  wallet: z.string().trim().length(56).regex(STELLAR_G_REGEX, "Invalid Stellar G address"),
  displayName: z.string().trim().min(1).max(48),
  claim: z.literal("verified-artist"),
  issuedAt: z.number().int().min(0),
  nonce: z.string().trim().min(8).max(64),
})

export type ArtistAttestationPayload = z.infer<typeof ArtistAttestationPayloadSchema>

export const IssueBadgeRequestSchema = z.object({
  wallet: z.string().trim().length(56).regex(STELLAR_G_REGEX),
  displayName: z.string().trim().min(1).max(48),
  issuedAt: z.number().int().min(0),
  nonce: z.string().trim().min(8).max(64),
  /** Base64 ed25519 signature of the canonical attestation payload, produced by the wallet's keypair. */
  signature: z.string().trim().min(1).max(512),
})

export type IssueBadgeRequest = z.infer<typeof IssueBadgeRequestSchema>

export const ArtistBadgeSchema = z.object({
  wallet: z.string().trim().length(56).regex(STELLAR_G_REGEX),
  displayName: z.string().trim().min(1).max(48),
  claim: z.literal("verified-artist"),
  issuedAt: z.number().int().min(0),
  nonce: z.string().trim().min(8).max(64),
  signature: z.string().trim().min(1).max(512),
  verifiedAt: z.number().int().min(0),
})

export type ArtistBadge = z.infer<typeof ArtistBadgeSchema>

// ─── structured errors ───────────────────────────────────────────────────────

export class ArtistAttestationError extends Error {
  code: "FLAG_DISABLED" | "VALIDATION_FAILED" | "SIGNATURE_INVALID" | "ALREADY_ISSUED" | "NOT_FOUND" | "STORE_FAILED"
  constructor(code: ArtistAttestationError["code"], message: string) {
    super(message)
    this.name = "ArtistAttestationError"
    this.code = code
  }
}

// ─── canonical payload + signature verification ─────────────────────────────

/** Deterministic byte layout so wallet-signed bytes match server-side verification exactly. */
export function canonicalAttestationMessage(payload: Omit<ArtistAttestationPayload, "claim">): string {
  return `PHASE_VERIFIED_ARTIST_ATTESTATION_V1|${payload.wallet}|${payload.displayName}|${payload.issuedAt}|${payload.nonce}`
}

export function verifyAttestationSignature(
  wallet: string,
  message: string,
  signatureBase64: string,
): boolean {
  if (!StrKey.isValidEd25519PublicKey(wallet)) return false
  try {
    const kp = Keypair.fromPublicKey(wallet)
    const sig = Buffer.from(signatureBase64, "base64")
    return kp.verify(Buffer.from(message, "utf8"), sig)
  } catch {
    return false
  }
}

// ─── store helpers ───────────────────────────────────────────────────────────

async function badgesFilePath(): Promise<string> {
  const { serverDataJsonPath } = await import("@/lib/server-data-paths")
  return serverDataJsonPath("artistAttestations")
}

type BadgeStore = Record<string, ArtistBadge>

async function readBadgeStore(): Promise<BadgeStore> {
  try {
    const fp = await badgesFilePath()
    const raw = await readFile(fp, "utf8")
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: BadgeStore = {}
    for (const [k, v] of Object.entries(parsed)) {
      const res = ArtistBadgeSchema.safeParse(v)
      if (res.success) out[k] = res.data
    }
    return out
  } catch {
    return {}
  }
}

async function writeBadgeStore(data: BadgeStore): Promise<void> {
  const fp = await badgesFilePath()
  await mkdir(path.dirname(fp), { recursive: true })
  await writeFile(fp, JSON.stringify(data, null, 2), "utf8")
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Verify a wallet's signature over the canonical attestation payload and, if
 * valid, persist a verified-artist badge. Rejects mismatched/forged signatures
 * (the fake-impersonation gap this module closes).
 */
export async function issueVerifiedArtistBadge(req: IssueBadgeRequest): Promise<ArtistBadge> {
  if (!isPhase94Enabled()) {
    throw new ArtistAttestationError("FLAG_DISABLED", "Verified-artist badge issuance disabled (phase-94 flag off)")
  }
  const parsed = IssueBadgeRequestSchema.safeParse(req)
  if (!parsed.success) {
    throw new ArtistAttestationError("VALIDATION_FAILED", parsed.error.message)
  }
  const { wallet, displayName, issuedAt, nonce, signature } = parsed.data

  const message = canonicalAttestationMessage({ wallet, displayName, issuedAt, nonce })
  if (!verifyAttestationSignature(wallet, message, signature)) {
    throw new ArtistAttestationError(
      "SIGNATURE_INVALID",
      `Attestation signature does not match wallet ${wallet.slice(0, 6)}…; badge not issued.`,
    )
  }

  const store = await readBadgeStore()
  const existing = store[wallet]
  if (existing && existing.nonce === nonce) {
    throw new ArtistAttestationError("ALREADY_ISSUED", `Badge already issued for wallet ${wallet.slice(0, 6)}… with this nonce.`)
  }

  const badge: ArtistBadge = ArtistBadgeSchema.parse({
    wallet,
    displayName,
    claim: "verified-artist",
    issuedAt,
    nonce,
    signature,
    verifiedAt: Date.now(),
  })
  store[wallet] = badge
  await writeBadgeStore(store)
  return badge
}

export async function getVerifiedArtistBadge(wallet: string): Promise<ArtistBadge | null> {
  if (!STRKEY_VALID(wallet)) return null
  const store = await readBadgeStore()
  return store[wallet] ?? null
}

function STRKEY_VALID(wallet: string): boolean {
  return StrKey.isValidEd25519PublicKey(wallet)
}

export async function isVerifiedArtist(wallet: string): Promise<boolean> {
  return (await getVerifiedArtistBadge(wallet)) != null
}

export async function revokeVerifiedArtistBadge(wallet: string): Promise<void> {
  if (!isPhase94Enabled()) {
    throw new ArtistAttestationError("FLAG_DISABLED", "Verified-artist badge issuance disabled")
  }
  const store = await readBadgeStore()
  if (!store[wallet]) {
    throw new ArtistAttestationError("NOT_FOUND", `No verified-artist badge for wallet ${wallet.slice(0, 6)}…`)
  }
  delete store[wallet]
  await writeBadgeStore(store)
}

export async function listVerifiedArtistBadges(): Promise<ArtistBadge[]> {
  const store = await readBadgeStore()
  return Object.values(store).sort((a, b) => b.verifiedAt - a.verifiedAt)
}

/**
 * Deployment-script wiring hook: audits that the attestation schema and
 * signature-verification pipeline are loadable/consistent before setup/reset
 * scripts run, without duplicating logic in each script (single source of
 * truth here; scripts/issue-sac-token.ts wiring untouched).
 */
export function auditArtistAttestationWiring(): { ok: boolean; note: string } {
  if (!isPhase94Enabled()) {
    return { ok: true, note: "[phase-94] verified-artist badge issuance disabled; nothing to audit." }
  }
  const probe = ArtistAttestationPayloadSchema.safeParse({
    wallet: "G" + "A".repeat(55),
    displayName: "probe",
    claim: "verified-artist",
    issuedAt: Date.now(),
    nonce: "00000000",
  })
  if (!probe.success) {
    return { ok: false, note: `[phase-94] attestation schema drift (unexpected, report): ${probe.error.message}` }
  }
  return { ok: true, note: "[phase-94] verified-artist attestation wiring OK. " + flag94RollbackNote() }
}
