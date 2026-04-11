import {
  Account,
  Asset,
  BASE_FEE,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk"
import { DEFAULT_LIQUIDITY_ASSET_CODE } from "@/lib/phase-contract-defaults"
import { HORIZON_URL } from "@/lib/phase-protocol"

export type ClassicLiqAsset = {
  code: string
  issuer: string
}

export type ClassicLiqWalletStatus = {
  accountExists: boolean
  hasTrustline: boolean
  balance: string | null
}

type HorizonBalance = {
  balance?: string
  asset_type?: string
  asset_code?: string
  asset_issuer?: string
}

type HorizonAccountResponse = {
  sequence?: string
  balances?: HorizonBalance[]
}

/** Cuerpo JSON de `GET /accounts/:id` en Horizon testnet (secuencia + balances). */
export type TestnetHorizonAccountJson = HorizonAccountResponse

export function nativeXlmBalanceFromHorizonAccount(data: TestnetHorizonAccountJson): number {
  const native = (data.balances ?? []).find((b) => b.asset_type === "native")
  const parsed = Number.parseFloat(native?.balance ?? "0")
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Una sola lectura de cuenta antes de armar changeTrust + firmar (menos awaits → mejor para Albedo, xBull, etc.).
 */
export async function fetchTestnetHorizonAccountJson(walletAddress: string): Promise<TestnetHorizonAccountJson> {
  if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
    throw new Error("Invalid wallet address.")
  }
  const res = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(walletAddress)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
  if (res.status === 404) {
    throw new Error("Account not found on testnet. Fund with test XLM first.")
  }
  if (!res.ok) {
    throw new Error(`Could not read account (${res.status}).`)
  }
  return (await res.json()) as TestnetHorizonAccountJson
}

/** Arma el XDR de changeTrust cuando ya tenés la secuencia (p. ej. tras un único fetch Horizon). */
export function buildClassicTrustlineXdrFromSequence(
  walletAddress: string,
  asset: ClassicLiqAsset,
  sequence: string,
): string {
  if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
    throw new Error("Invalid wallet address.")
  }
  const seq = sequence.trim()
  if (!seq) throw new Error("Missing account sequence.")

  const source = new Account(walletAddress, seq)
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.changeTrust({
        asset: createClassicAsset(asset),
      }),
    )
    .setTimeout(120)
    .build()

  return tx.toXDR()
}

/** Emisor clásico PHASELQ en testnet (Stellar Expert: PHASELQ-GD7V…). */
export const DEFAULT_CLASSIC_PHASER_LIQ_ISSUER =
  "GD7VAD4VDVHASKZIJPRORMXLML4RSVLRANYNRCCBWLO5ACOSYQZBSUFI"

/** Emisor del asset clásico **PHASERLIQ** (código legacy; distinto de PHASELQ). */
export const LEGACY_PHASERLIQ_ISSUER =
  "GAXRPE5JXPY7RJONMCEWFXELVWDW3CSA7H6LAGYKTOYLFQQDJ5DT4GNS"

/** Para `stellar.toml`: siempre un issuer G válido para que wallets enlacen trustline ↔ fila CURRENCIES ↔ image. */
export function classicLiqIssuerForStellarToml(): string {
  const fromEnv = process.env.NEXT_PUBLIC_CLASSIC_LIQ_ISSUER?.trim() ?? ""
  if (fromEnv && StrKey.isValidEd25519PublicKey(fromEnv)) return fromEnv
  return DEFAULT_CLASSIC_PHASER_LIQ_ISSUER
}

export function classicLiqCodeForStellarToml(): string {
  return process.env.NEXT_PUBLIC_CLASSIC_LIQ_ASSET_CODE?.trim() || DEFAULT_LIQUIDITY_ASSET_CODE
}

export function classicLiqAssetConfigFromPublicEnv(): ClassicLiqAsset | null {
  const code = process.env.NEXT_PUBLIC_CLASSIC_LIQ_ASSET_CODE?.trim() ?? ""
  const issuer = process.env.NEXT_PUBLIC_CLASSIC_LIQ_ISSUER?.trim() ?? ""
  if (!code || !issuer) return null
  if (!StrKey.isValidEd25519PublicKey(issuer)) return null
  return { code, issuer }
}

/**
 * Contract ID Soroban (C…) del Stellar Asset Contract que envuelve el par clásico (code + issuer).
 * Debe ser el mismo que `NEXT_PUBLIC_TOKEN_CONTRACT_ID` / `TOKEN_CONTRACT_ID` si usas ese asset como PHASELQ.
 * Compruébalo en Stellar Expert: cuenta emisora → sección Assets → enlace «Contract ID».
 */
export function expectedClassicPhaserLiqSorobanContractId(): string {
  return new Asset(classicLiqCodeForStellarToml(), classicLiqIssuerForStellarToml()).contractId(Networks.TESTNET)
}

/** Una fila [[CURRENCIES]] en stellar.toml (SAC distinto por emisor). */
export type StellarTomlPhaserLiqCurrencyRow = {
  code: string
  issuer: string
  script: string
}

/**
 * Filas `[[CURRENCIES]]` para stellar.toml: cada par **(code, issuer)** correcto.
 * Antes se repetía el código PHASELQ para todos los emisores; GAXR emitió **PHASERLIQ**, no PHASELQ → Stellar Expert no enlazaba metadata.
 *
 * Stellar Expert solo muestra TOML si la cuenta emisora tiene `home_domain` apuntando al host donde está `/.well-known/stellar.toml`.
 */
export function stellarTomlPhaserLiqCurrencyRows(): StellarTomlPhaserLiqCurrencyRow[] {
  const rows: StellarTomlPhaserLiqCurrencyRow[] = []
  const seen = new Set<string>()

  const pushPair = (assetCode: string, issuerG: string) => {
    const iss = issuerG.trim()
    const c = assetCode.trim()
    if (!c || !StrKey.isValidEd25519PublicKey(iss)) return
    const key = `${c}|${iss}`
    if (seen.has(key)) return
    seen.add(key)
    try {
      const asset = new Asset(c, iss)
      rows.push({
        code: c,
        issuer: iss,
        script: asset.contractId(Networks.TESTNET),
      })
    } catch {
      /* combinación inválida para Asset */
    }
  }

  const primaryIssuer = classicLiqIssuerForStellarToml()
  const primaryCode = classicLiqCodeForStellarToml()

  pushPair(primaryCode, primaryIssuer)
  pushPair("PHASERLIQ", LEGACY_PHASERLIQ_ISSUER)

  const defaultIssuer = DEFAULT_CLASSIC_PHASER_LIQ_ISSUER
  const defaultCode = DEFAULT_LIQUIDITY_ASSET_CODE
  if (defaultIssuer !== primaryIssuer || defaultCode !== primaryCode) {
    pushPair(defaultCode, defaultIssuer)
  }

  return rows
}

export function isClassicLiqEnabledPublic(): boolean {
  return classicLiqAssetConfigFromPublicEnv() != null
}

export function createClassicAsset(asset: ClassicLiqAsset) {
  return new Asset(asset.code, asset.issuer)
}

export async function readClassicWalletStatus(
  walletAddress: string,
  asset: ClassicLiqAsset,
): Promise<ClassicLiqWalletStatus> {
  if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
    return { accountExists: false, hasTrustline: false, balance: null }
  }
  const res = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(walletAddress)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
  if (res.status === 404) {
    return { accountExists: false, hasTrustline: false, balance: null }
  }
  if (!res.ok) {
    throw new Error(`Horizon account lookup failed (${res.status})`)
  }
  const data = (await res.json()) as HorizonAccountResponse
  const balances = Array.isArray(data.balances) ? data.balances : []
  const line = balances.find(
    (b) => b.asset_type !== "native" && b.asset_code === asset.code && b.asset_issuer === asset.issuer,
  )
  return {
    accountExists: true,
    hasTrustline: Boolean(line),
    balance: typeof line?.balance === "string" ? line.balance : null,
  }
}

export async function buildClassicTrustlineTransactionXdr(
  walletAddress: string,
  asset: ClassicLiqAsset,
): Promise<string> {
  const accountJson = await fetchTestnetHorizonAccountJson(walletAddress)
  const sequence = accountJson.sequence?.trim()
  if (!sequence) throw new Error("Missing account sequence.")
  return buildClassicTrustlineXdrFromSequence(walletAddress, asset, sequence)
}

export function parseSignedTxXdr(result: unknown): string | null {
  if (!result || typeof result !== "object") return null
  const r = result as { signedTxXdr?: string; signedTransaction?: string }
  return r.signedTxXdr || r.signedTransaction || null
}
