/**
 * Validaciones estrictas de variables de entorno para prevenir errores comunes
 * en la configuración de contratos y cuentas Stellar.
 */

import { StrKey } from "@stellar/stellar-sdk"
import { z } from "zod"

export type EnvValidationError = {
  variable: string
  issue: "missing" | "invalid_format" | "wrong_key_type"
  message: string
  hint: string
}

export type EnvValidationResult = {
  valid: boolean
  errors: EnvValidationError[]
}

function isValidContractId(value: string): boolean {
  return StrKey.isValidContract(value)
}

function isValidAccountId(value: string): boolean {
  return StrKey.isValidEd25519PublicKey(value)
}

/**
 * Valida que un ID de contrato sea válido (prefijo C...) y no una cuenta (G...)
 */
function validateContractId(
  value: string | undefined,
  varName: string,
  purpose: string,
): EnvValidationError | null {
  if (!value || value.trim().length === 0) {
    return {
      variable: varName,
      issue: "missing",
      message: `${varName} no está configurado.`,
      hint: `Debes configurar ${varName} con el Contract ID del ${purpose}. Ejemplo: stellar contract deploy...`,
    }
  }

  const trimmed = value.trim()

  // Detectar si es una cuenta G... en lugar de un contrato C...
  if (isValidAccountId(trimmed) && !isValidContractId(trimmed)) {
    return {
      variable: varName,
      issue: "wrong_key_type",
      message: `${varName} es una dirección de cuenta (G...) pero debe ser un Contract ID (C...).`,
      hint: `El valor actual parece ser una wallet Freighter. Necesitas el Contract ID del ${purpose}. Ejecuta: stellar contract deploy ... o stellar contract asset deploy ...`,
    }
  }

  if (!isValidContractId(trimmed)) {
    return {
      variable: varName,
      issue: "invalid_format",
      message: `${varName} no es un Contract ID válido.`,
      hint: `El Contract ID debe comenzar con "C" y tener 56 caracteres. Ejemplo: CDOAXHWC6YJB7U3ELV67HKJY6HEMJFBNRGJK6WZGUAELBWP3WP77RLFD`,
    }
  }

  return null
}

/**
 * Recorre claves de env en el mismo orden que `lib/phase-protocol.ts`.
 * Si ninguna está definida, la app usa defaults — no es error.
 * Si alguna está definida, debe ser un Contract ID válido (C…).
 */
function validateContractEnvChain(
  env: NodeJS.ProcessEnv,
  keys: string[],
  purpose: string,
): EnvValidationError | null {
  for (const key of keys) {
    const raw = env[key as keyof NodeJS.ProcessEnv]
    if (raw == null || String(raw).trim().length === 0) continue
    const err = validateContractId(String(raw).trim(), key, purpose)
    if (err) return err
    return null
  }
  return null
}

/**
 * Valida que una secret key sea válida
 */
function validateSecretKey(
  value: string | undefined,
  varName: string,
  required: boolean = false,
): EnvValidationError | null {
  if (!value || value.trim().length === 0) {
    if (required) {
      return {
        variable: varName,
        issue: "missing",
        message: `${varName} es requerido pero no está configurado.`,
        hint: `Configura ${varName} en tu archivo .env.local`,
      }
    }
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length < 20) {
    return {
      variable: varName,
      issue: "invalid_format",
      message: `${varName} parece estar incompleto o mal formateado.`,
      hint: `La secret key debe tener al menos 20 caracteres y comenzar con "S".`,
    }
  }

  try {
    // Intentar parsear como keypair
    const { Keypair } = require("@stellar/stellar-sdk")
    Keypair.fromSecret(trimmed)
  } catch {
    return {
      variable: varName,
      issue: "invalid_format",
      message: `${varName} no es una secret key válida de Stellar.`,
      hint: `La secret key debe comenzar con "S" y ser válida para ed25519.`,
    }
  }

  return null
}

/**
 * Valida la configuración completa de entorno para PHASE
 */
export function validatePhaseEnv(): EnvValidationResult {
  const errors: EnvValidationError[] = []
  const env = process.env || {}

  // Contratos Soroban: mismas claves y defaults que `phase-protocol.ts` (omitir "missing" si todo vacío).
  const tokenContract = validateContractEnvChain(
    env,
    [
      "NEXT_PUBLIC_PHASER_TOKEN_ID",
      "PHASER_TOKEN_ID",
      "NEXT_PUBLIC_TOKEN_CONTRACT_ID",
      "TOKEN_CONTRACT_ID",
      "MOCK_TOKEN_ID",
    ],
    "token PHASELQ (Soroban)",
  )
  if (tokenContract) errors.push(tokenContract)

  const phaseProtocol = validateContractEnvChain(
    env,
    ["NEXT_PUBLIC_PHASE_PROTOCOL_ID", "PHASE_PROTOCOL_ID"],
    "protocolo PHASE (NFT)",
  )
  if (phaseProtocol) errors.push(phaseProtocol)

  // Validar secret keys del faucet si están configuradas
  const adminSecret = validateSecretKey(env.ADMIN_SECRET_KEY, "ADMIN_SECRET_KEY")
  if (adminSecret) errors.push(adminSecret)

  const distributorSecret = validateSecretKey(env.FAUCET_DISTRIBUTOR_SECRET_KEY, "FAUCET_DISTRIBUTOR_SECRET_KEY")
  if (distributorSecret) errors.push(distributorSecret)

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Verifica si ADMIN_SECRET_KEY corresponde al issuer del asset clásico
 * Devuelve null si todo está bien, o un mensaje de error si hay problema
 */
export function validateFaucetIssuerConfig(
  adminSecret: string | undefined,
  expectedIssuer: string,
): string | null {
  if (!adminSecret || adminSecret.trim().length < 20) {
    return null // No hay admin configurado, no es error (puede usar distributor)
  }

  try {
    const { Keypair } = require("@stellar/stellar-sdk")
    const kp = Keypair.fromSecret(adminSecret.trim())
    const signerPublic = kp.publicKey()

    if (signerPublic !== expectedIssuer) {
      return `ADMIN_SECRET_KEY (${signerPublic.slice(0, 8)}...) no coincide con el issuer esperado (${expectedIssuer.slice(0, 8)}...). ` +
        `Para el modo mint del faucet, ADMIN_SECRET_KEY debe ser el secret del issuer del asset PHASELQ. ` +
        `Alternativa: usa FAUCET_DISTRIBUTOR_SECRET_KEY para modo transfer.`
    }
  } catch {
    return "ADMIN_SECRET_KEY no es una secret key válida de Stellar."
  }

  return null
}

// ─── phase-95: follow-graph export and import portability (isolated) ───────
//
// Social graphs were previously locked to the platform — a wallet's follows
// lived only in `lib/follow-store.ts`'s file-backed store, with no way to
// take that graph elsewhere or restore it. This module builds a portable,
// versioned, checksummed export bundle and validates a bundle before import,
// preserving `scripts/diagnose-env.ts` / `diagnose-env.ts` wiring (which only
// prints a readiness summary, unchanged behavior when the flag is off).
//
// Feature flag: phase-95 (NEXT_PUBLIC_FEATURE_PHASE_95 / FEATURE_PHASE_95)
// Rollback: unset flag → export/import calls throw FLAG_DISABLED; existing
//           follow-store data is untouched (read/write path in follow-store.ts
//           is not modified by this module).

export function isPhase95Enabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_FEATURE_PHASE_95 ?? process.env.FEATURE_PHASE_95 ?? "").trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

export function flag95RollbackNote(): string {
  return "Rollback phase-95: unset NEXT_PUBLIC_FEATURE_PHASE_95 / FEATURE_PHASE_95 or set to 0/false and restart. Follow-store data is untouched; export/import simply becomes unavailable."
}

const STELLAR_G_REGEX = /^G[A-Z2-7]{55}$/
export const FOLLOW_GRAPH_EXPORT_FORMAT_VERSION = 1 as const

export const FollowGraphExportSchema = z.object({
  format: z.literal("phase-follow-graph"),
  version: z.literal(1),
  wallet: z.string().trim().length(56).regex(STELLAR_G_REGEX, "Invalid Stellar G address"),
  following: z.array(z.string().trim().length(56).regex(STELLAR_G_REGEX)).max(10_000),
  followers: z.array(z.string().trim().length(56).regex(STELLAR_G_REGEX)).max(10_000),
  exportedAt: z.number().int().min(0),
  checksum: z.string().regex(/^[a-f0-9]{16}$/, "Invalid checksum"),
})

export type FollowGraphExport = z.infer<typeof FollowGraphExportSchema>

export class FollowGraphPortabilityError extends Error {
  code: "FLAG_DISABLED" | "VALIDATION_FAILED" | "CHECKSUM_MISMATCH" | "WALLET_MISMATCH"
  constructor(code: FollowGraphPortabilityError["code"], message: string) {
    super(message)
    this.name = "FollowGraphPortabilityError"
    this.code = code
  }
}

/** Deterministic 16-hex-char checksum (FNV-1a) so tampered/corrupted bundles are caught before import. */
export function computeFollowGraphChecksum(wallet: string, following: string[], followers: string[]): string {
  const payload = `${wallet}|${[...following].sort().join(",")}|${[...followers].sort().join(",")}`
  let h1 = 0x811c9dc5
  let h2 = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c ^ 0x9e3779b9, 0x01000193)
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, "0")
  const hex2 = (h2 >>> 0).toString(16).padStart(8, "0")
  return (hex1 + hex2).slice(0, 16)
}

/** Builds a portable, checksummed export bundle for a wallet's follow graph. */
export function buildFollowGraphExport(
  wallet: string,
  following: string[],
  followers: string[],
): FollowGraphExport {
  if (!isPhase95Enabled()) {
    throw new FollowGraphPortabilityError("FLAG_DISABLED", "Follow-graph export disabled (phase-95 flag off)")
  }
  const cleanWallet = wallet.trim()
  const bundle: FollowGraphExport = {
    format: "phase-follow-graph",
    version: FOLLOW_GRAPH_EXPORT_FORMAT_VERSION,
    wallet: cleanWallet,
    following: [...new Set(following.map((w) => w.trim()))],
    followers: [...new Set(followers.map((w) => w.trim()))],
    exportedAt: Date.now(),
    checksum: computeFollowGraphChecksum(cleanWallet, following, followers),
  }
  const parsed = FollowGraphExportSchema.safeParse(bundle)
  if (!parsed.success) {
    throw new FollowGraphPortabilityError("VALIDATION_FAILED", parsed.error.message)
  }
  return parsed.data
}

export type ImportedFollowGraph = {
  wallet: string
  following: string[]
  followers: string[]
}

/**
 * Validates an import bundle (schema, checksum, and — unless explicitly
 * bypassed — the wallet identity) before it is merged into the follow-store.
 */
export function parseFollowGraphImport(
  raw: unknown,
  opts: { expectedWallet?: string } = {},
): ImportedFollowGraph {
  if (!isPhase95Enabled()) {
    throw new FollowGraphPortabilityError("FLAG_DISABLED", "Follow-graph import disabled (phase-95 flag off)")
  }
  const parsed = FollowGraphExportSchema.safeParse(raw)
  if (!parsed.success) {
    throw new FollowGraphPortabilityError("VALIDATION_FAILED", parsed.error.message)
  }
  const bundle = parsed.data
  const recomputed = computeFollowGraphChecksum(bundle.wallet, bundle.following, bundle.followers)
  if (recomputed !== bundle.checksum) {
    throw new FollowGraphPortabilityError("CHECKSUM_MISMATCH", "Follow-graph bundle checksum does not match its contents; bundle may be corrupted or tampered with.")
  }
  if (opts.expectedWallet && opts.expectedWallet.trim() !== bundle.wallet) {
    throw new FollowGraphPortabilityError("WALLET_MISMATCH", `Bundle wallet ${bundle.wallet.slice(0, 6)}… does not match expected wallet ${opts.expectedWallet.slice(0, 6)}….`)
  }
  return { wallet: bundle.wallet, following: bundle.following, followers: bundle.followers }
}

/**
 * `scripts/diagnose-env.ts` / `diagnose-env.ts` wiring hook: audits that the
 * export/import schema is loadable/consistent without touching the follow
 * store, so the diagnose script keeps printing its summary unchanged.
 */
export function auditFollowGraphPortabilityWiring(): { ok: boolean; note: string } {
  if (!isPhase95Enabled()) {
    return { ok: true, note: "[phase-95] follow-graph export/import disabled; nothing to audit." }
  }
  const probeWallet = "G" + "A".repeat(55)
  try {
    const bundle = buildFollowGraphExport(probeWallet, [], [])
    parseFollowGraphImport(bundle, { expectedWallet: probeWallet })
    return { ok: true, note: "[phase-95] follow-graph portability wiring OK. " + flag95RollbackNote() }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, note: `[phase-95] follow-graph portability schema drift (unexpected, report): ${msg}` }
  }
}

/**
 * Formatea errores de validación para mostrar en consola
 */
export function formatEnvValidationErrors(result: EnvValidationResult): string {
  if (result.valid) return "✓ Configuración de entorno válida"

  const lines = ["✗ Errores en la configuración de entorno:"]
  for (const err of result.errors) {
    lines.push(`\n[${err.variable}] ${err.issue.toUpperCase()}`)
    lines.push(`  Error: ${err.message}`)
    lines.push(`  Hint: ${err.hint}`)
  }
  return lines.join("\n")
}
