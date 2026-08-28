/**
 * Reset de identidades testnet para PHASELQ clásico + distribuidor con liquidez.
 *
 * Crea issuer + distributor, fondea con Friendbot, trustline, pago masivo al distribuidor.
 * Imprime variables para `.env.local` y el comando Stellar CLI para desplegar el SAC.
 *
 * Uso (desde la raíz del repo):
 *   cd scripts && npm install && npm run reset:phase
 *
 * O desde la raíz:
 *   npm run reset:phase
 *
 * Después, despliega el Stellar Asset Contract (SAC) en testnet:
 *   stellar contract asset deploy --asset PHASELQ:<ISSUER_G> --network testnet
 * Copia el Contract ID (C…) a:
 *   NEXT_PUBLIC_TOKEN_CONTRACT_ID
 *   NEXT_PUBLIC_PHASER_TOKEN_ID
 *
 * Opcional: publicar home_domain para stellar.toml / Stellar Expert:
 *   cd scripts && CLASSIC_LIQ_ISSUER_SECRET=<issuer secret> npm run set:issuer-home-domain
 *
 * Si ya tienes issuer + distribuidor en .env.local y solo falta trustline + primer pago:
 *   npm run classic:distributor-trust-and-pay  →  scripts/distributor-trust-and-payment.ts
 */
import * as dotenv from "dotenv"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk"
import { z } from "zod"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(repoRoot, ".env.local") })
dotenv.config({ path: path.join(repoRoot, ".env") })
dotenv.config({ path: path.join(__dirname, ".env") })

const HORIZON_URL = process.env.HORIZON_TESTNET_URL?.trim() || "https://horizon-testnet.stellar.org"
const NETWORK_PASSPHRASE = Networks.TESTNET
/** Override: p. ej. `RESET_PHASE_ASSET_CODE=PHASERLIQ` solo si mantienes un código legacy distinto. */
const ASSET_CODE = process.env.RESET_PHASE_ASSET_CODE?.trim() || "PHASELQ"
/** Cantidad enviada al distribuidor (formato Stellar, 7 decimales). */
const INITIAL_DISTRIBUTOR_AMOUNT = process.env.RESET_PHASE_MINT_AMOUNT?.trim() || "1000000.0000000"

// ── phase-124: metadata version migration tool (isolated, feature-flagged) ──
// Feature flag: phase-124 — NEXT_PUBLIC_FEATURE_PHASE_124 / FEATURE_PHASE_124
// Rollback: unset flag or set to 0/false and restart; no ledger mutation.

function isPhase124Enabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_FEATURE_PHASE_124 ?? process.env.FEATURE_PHASE_124 ?? "").trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

export const METADATA_MIGRATION_CURRENT_VERSION = 2 as const
export type MetadataVersion = 1 | 2

const MetadataV1Schema = z.object({
  version: z.literal(1).optional(),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).optional().default(""),
  image: z.string().max(1024).optional().default(""),
  attributes: z.array(z.object({ trait_type: z.string(), value: z.union([z.string(), z.number()]) })).optional().default([]),
})

const MetadataV2Schema = z.object({
  version: z.literal(2),
  name: z.string().min(1).max(256),
  description: z.string().max(2048),
  image: z.string().max(1024),
  external_url: z.string().optional().default(""),
  attributes: z.array(z.object({ trait_type: z.string().min(1).max(64), value: z.union([z.string(), z.number()]), display_type: z.enum(["number", "date", "boost_percentage"]).optional() })),
  collectionId: z.number().int().min(0).nullable().default(null),
  migratedAt: z.string().datetime().optional(),
  migratedFrom: z.union([z.literal(1), z.literal(2)]).optional(),
})

export type MetadataV2 = z.infer<typeof MetadataV2Schema>

export class MetadataMigrationError extends Error {
  code: "VALIDATION_FAILED" | "UNSUPPORTED_VERSION" | "MIGRATION_FAILED" | "FLAG_DISABLED"
  details?: unknown
  constructor(code: MetadataMigrationError["code"], message: string, details?: unknown) {
    super(message)
    this.name = "MetadataMigrationError"
    this.code = code
    this.details = details
  }
}

function detectMetadataVersion(raw: unknown): MetadataVersion | null {
  if (raw && typeof raw === "object" && "version" in raw) {
    const v = (raw as { version?: unknown }).version
    if (v === 1 || v === 2) return v as MetadataVersion
    if (v === "1" || v === "2") return Number(v) as MetadataVersion
  }
  if (raw && typeof raw === "object" && "name" in raw) return 1
  return null
}

function migrateV1ToV2(v1: z.infer<typeof MetadataV1Schema>, opts?: { baseUrl?: string }): MetadataV2 {
  const attrs = (v1.attributes ?? []).map((a) => ({ trait_type: String(a.trait_type).trim().slice(0, 64) || "unknown", value: a.value }))
  return {
    version: 2,
    name: v1.name.trim(),
    description: (v1.description ?? "").trim(),
    image: (v1.image ?? "").trim(),
    external_url: opts?.baseUrl ?? "",
    attributes: attrs as MetadataV2["attributes"],
    collectionId: null,
    migratedAt: new Date().toISOString(),
    migratedFrom: 1,
  }
}

export type MigrateMetadataOptions = { dryRun?: boolean; baseUrl?: string; strict?: boolean; force?: boolean }
export type MigrateMetadataResult =
  | { ok: true; version: MetadataVersion; data: MetadataV2; migrated: boolean; fromVersion: MetadataVersion }
  | { ok: false; error: MetadataMigrationError }

export function migrateMetadataPayload(raw: unknown, opts: MigrateMetadataOptions = {}): MigrateMetadataResult {
  const enabled = opts.force || isPhase124Enabled()
  if (!enabled) {
    return { ok: false, error: new MetadataMigrationError("FLAG_DISABLED", "Metadata migration disabled (phase-124 off). Set FEATURE_PHASE_124=1.") }
  }
  const detected = detectMetadataVersion(raw)
  if (detected == null) {
    return { ok: false, error: new MetadataMigrationError("UNSUPPORTED_VERSION", "Cannot detect metadata version; payload missing `name`/`version`.") }
  }
  try {
    if (detected === 2) {
      const parsed = MetadataV2Schema.safeParse(raw)
      if (!parsed.success) {
        if (opts.strict) return { ok: false, error: new MetadataMigrationError("VALIDATION_FAILED", parsed.error.message, parsed.error.flatten()) }
        const v1f = MetadataV1Schema.safeParse(raw)
        if (!v1f.success) return { ok: false, error: new MetadataMigrationError("VALIDATION_FAILED", parsed.error.message, parsed.error.flatten()) }
        const v2 = migrateV1ToV2(v1f.data, { baseUrl: opts.baseUrl })
        return { ok: true, version: 2, data: v2, migrated: true, fromVersion: 1 }
      }
      return { ok: true, version: 2, data: parsed.data, migrated: false, fromVersion: 2 }
    }
    const p1 = MetadataV1Schema.safeParse(raw)
    if (!p1.success) return { ok: false, error: new MetadataMigrationError("VALIDATION_FAILED", p1.error.message, p1.error.flatten()) }
    const migrated = migrateV1ToV2(p1.data, { baseUrl: opts.baseUrl })
    const fin = MetadataV2Schema.safeParse(migrated)
    if (!fin.success) return { ok: false, error: new MetadataMigrationError("MIGRATION_FAILED", fin.error.message, fin.error.flatten()) }
    return { ok: true, version: 2, data: fin.data, migrated: true, fromVersion: 1 }
  } catch (e) {
    return { ok: false, error: new MetadataMigrationError("MIGRATION_FAILED", e instanceof Error ? e.message : String(e), e) }
  }
}

export type BatchMigrateReport = { total: number; migrated: number; alreadyCurrent: number; failed: number; failures: Array<{ index: number; error: string; code: string }>; results: MetadataV2[] }

export function batchMigrateMetadataPayloads(payloads: unknown[], opts: MigrateMetadataOptions = {}): BatchMigrateReport {
  const report: BatchMigrateReport = { total: payloads.length, migrated: 0, alreadyCurrent: 0, failed: 0, failures: [], results: [] }
  payloads.forEach((raw, i) => {
    const r = migrateMetadataPayload(raw, opts)
    if (!r.ok) { report.failed++; report.failures.push({ index: i, error: r.error.message, code: r.error.code }); return }
    report.results.push(r.data)
    if (r.migrated) report.migrated++; else report.alreadyCurrent++
  })
  return report
}

export async function migrateMetadataFilesInDir(dir: string, opts: MigrateMetadataOptions & { pattern?: RegExp } = {}): Promise<BatchMigrateReport & { files: string[] }> {
  const enabled = opts.force || isPhase124Enabled()
  if (!enabled) throw new MetadataMigrationError("FLAG_DISABLED", "Migration flag off")
  const pat = opts.pattern ?? /\.json$/
  let entries: string[] = []
  try { entries = await fs.readdir(dir) } catch { return { total: 0, migrated: 0, alreadyCurrent: 0, failed: 0, failures: [], results: [], files: [] } }
  const files = entries.filter((f) => pat.test(f)).map((f) => path.join(dir, f))
  const payloads: unknown[] = []
  for (const f of files) {
    try { payloads.push(JSON.parse(await fs.readFile(f, "utf8"))) } catch { /* skip invalid */ }
  }
  const r = batchMigrateMetadataPayloads(payloads, opts)
  if (!opts.dryRun) {
    for (let i = 0; i < files.length; i++) {
      const res = migrateMetadataPayload(payloads[i], opts)
      if (res.ok && res.migrated) {
        await fs.writeFile(files[i]!, JSON.stringify(res.data, null, 2), "utf8")
      }
    }
  }
  return { ...r, files }
}

const server = new Horizon.Server(HORIZON_URL)

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`
  const res = await fetch(url)
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Friendbot falló (${res.status}): ${t.slice(0, 240)}`)
  }
}

async function waitForAccount(publicKey: string, label: string): Promise<void> {
  const maxAttempts = 20
  const delayMs = 1500
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await server.loadAccount(publicKey)
      return
    } catch {
      if (i === maxAttempts - 1) {
        throw new Error(`Timeout esperando cuenta ${label} (${publicKey.slice(0, 8)}…) en Horizon.`)
      }
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}

async function main() {
  console.log("INICIANDO RESET DE PROTOCOLO PHASE (testnet clásico + distribuidor)\n")

  const issuer = Keypair.random()
  const distributor = Keypair.random()

  console.log(`ISSUER (emisor del asset ${ASSET_CODE})`)
  console.log(`  Public:  ${issuer.publicKey()}`)
  console.log(`  Secret:  ${issuer.secret()}`)
  console.log("")
  console.log("DISTRIBUTOR (faucet / transfer mode)")
  console.log(`  Public:  ${distributor.publicKey()}`)
  console.log(`  Secret:  ${distributor.secret()}`)
  console.log("")

  console.log("Friendbot: fondeando XLM…")
  await fundWithFriendbot(issuer.publicKey())
  await new Promise((r) => setTimeout(r, 1200))
  await fundWithFriendbot(distributor.publicKey())

  console.log("Esperando que Horizon indexe las cuentas…")
  await waitForAccount(issuer.publicKey(), "issuer")
  await waitForAccount(distributor.publicKey(), "distributor")

  const phaserLiq = new Asset(ASSET_CODE, issuer.publicKey())

  console.log(`Creando trustline del distribuidor hacia ${ASSET_CODE}…`)
  const accountDist = await server.loadAccount(distributor.publicKey())
  const txTrust = new TransactionBuilder(accountDist, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset: phaserLiq,
      }),
    )
    .setTimeout(180)
    .build()
  txTrust.sign(distributor)
  const trustRes = await server.submitTransaction(txTrust)
  console.log(`  OK — trustline. Hash: ${trustRes.hash}`)

  console.log(`Emitiendo ${INITIAL_DISTRIBUTOR_AMOUNT} ${ASSET_CODE} al distribuidor…`)
  const accountIssuer = await server.loadAccount(issuer.publicKey())
  const txMint = new TransactionBuilder(accountIssuer, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: distributor.publicKey(),
        asset: phaserLiq,
        amount: INITIAL_DISTRIBUTOR_AMOUNT,
      }),
    )
    .setTimeout(180)
    .build()
  txMint.sign(issuer)
  const mintRes = await server.submitTransaction(txMint)
  console.log(`  OK — payment. Hash: ${mintRes.hash}`)

  console.log("\n--- Copia en .env.local (raíz del repo) ---\n")
  console.log(`NEXT_PUBLIC_CLASSIC_LIQ_ASSET_CODE="${ASSET_CODE}"`)
  console.log(`NEXT_PUBLIC_CLASSIC_LIQ_ISSUER="${issuer.publicKey()}"`)
  console.log(`CLASSIC_LIQ_ISSUER_SECRET="${issuer.secret()}"`)
  console.log(`FAUCET_DISTRIBUTOR_SECRET_KEY="${distributor.secret()}"`)
  console.log("")
  console.log("Luego despliega el SAC y añade el Contract ID (C…), por ejemplo:")
  console.log("")
  console.log(
    `  stellar contract asset deploy --asset ${ASSET_CODE}:${issuer.publicKey()} --network testnet`,
  )
  console.log("")
  console.log("Pega el C… en:")
  console.log('  NEXT_PUBLIC_TOKEN_CONTRACT_ID="C…"')
  console.log('  NEXT_PUBLIC_PHASER_TOKEN_ID="C…"')
  console.log("")
  console.log("Si el contrato PHASE ya está inicializado con otro token, hay que volver a llamar")
  console.log("`initialize` en el WASM con este nuevo SAC, o redeploy + init alineado.")
  console.log("")
  console.log("Guarda estos secrets en un gestor seguro; no los subas a git.")

  // ── phase-124: optional metadata migration (behind flag) ──
  // Usage: FEATURE_PHASE_124=1 npm run reset:phase -- --migrate-metadata [--dry-run]
  // Or: FEATURE_PHASE_124=1 node --loader tsx scripts/reset-phase.ts --migrate-metadata
  if (process.argv.includes("--migrate-metadata")) {
    if (!isPhase124Enabled()) {
      console.log("\n[phase-124] --migrate-metadata requested but flag disabled (FEATURE_PHASE_124=1 required). Skipping.")
    } else {
      const dryRun = process.argv.includes("--dry-run")
      const dataDir = path.join(repoRoot, ".data")
      console.log(`\n[phase-124] Migrating metadata in ${dataDir} (dryRun=${dryRun})…`)
      try {
        const report = await migrateMetadataFilesInDir(dataDir, { dryRun, force: true })
        console.log(`[phase-124] total=${report.total} migrated=${report.migrated} alreadyCurrent=${report.alreadyCurrent} failed=${report.failed}`)
        if (report.failures.length > 0) console.warn("[phase-124] failures:", report.failures)
        // Also check public/phaser-liq.metadata.json schema drift
        const publicMetaPath = path.join(repoRoot, "public", "phaser-liq.metadata.json")
        try {
          const raw = await fs.readFile(publicMetaPath, "utf8")
          const parsed = JSON.parse(raw)
          const migrated = migrateMetadataPayload(parsed, { dryRun, force: true })
          if (!migrated.ok) console.warn(`[phase-124] public metadata validation: ${migrated.error.message} (${migrated.error.code})`)
          else if (migrated.migrated) console.log("[phase-124] public metadata would migrate v1→v2 (additive, safe)")
        } catch { /* optional */ }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[phase-124] migration error: ${msg}`)
      }
    }
  } else if (isPhase124Enabled()) {
    console.log("\n[phase-124] Metadata migration tool ready (flag enabled). Pass --migrate-metadata to run; --dry-run to preview. Rollback: unset FEATURE_PHASE_124.")
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
