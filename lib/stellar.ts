/**
 * Stellar clásico (Horizon) — asset PHASERLIQ alineado con TrustlineButton / stellar.toml.
 * TrustlineButton usa el `asset` devuelto por GET /api/classic-liq; ese endpoint debe usar
 * la misma resolución que aquí cuando no hay CLASSIC_LIQ_ISSUER_SECRET.
 */

import { Asset, rpc, StrKey } from "@stellar/stellar-sdk"
import {
  classicLiqAssetConfigFromPublicEnv,
  classicLiqCodeForStellarToml,
  classicLiqIssuerForStellarToml,
  readClassicWalletStatus,
  type ClassicLiqAsset,
} from "@/lib/classic-liq"

/**
 * Activo clásico para trustline / comprobaciones Horizon: si NEXT_PUBLIC_* está completo,
 * coincide con Freighter; si no, cae al mismo emisor por defecto que `stellar.toml` (GAX… + PHASERLIQ).
 */
export function resolvePhaserLiqClassicAsset(): ClassicLiqAsset {
  const fromEnv = classicLiqAssetConfigFromPublicEnv()
  if (fromEnv) return fromEnv
  return {
    code: classicLiqCodeForStellarToml(),
    issuer: classicLiqIssuerForStellarToml(),
  }
}

/** Mismo par (code, issuer) que `Operation.changeTrust` en TrustlineButton cuando el API usa resolve. */
export function createPhaserLiqClassicSdkAsset(): Asset {
  const a = resolvePhaserLiqClassicAsset()
  return new Asset(a.code, a.issuer)
}

/**
 * El servidor no puede firmar changeTrust por el usuario; solo comprobar Horizon antes de un payment.
 * Usar en rutas que envían PHASERLIQ clásico (p. ej. bootstrap issuer → wallet).
 */
export async function ensureTrustlineBeforeClassicPayment(
  walletAddress: string,
  asset: ClassicLiqAsset = resolvePhaserLiqClassicAsset(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
    return { ok: false, reason: "invalid_wallet" }
  }
  const st = await readClassicWalletStatus(walletAddress, asset)
  if (!st.accountExists) return { ok: false, reason: "account_missing" }
  if (!st.hasTrustline) return { ok: false, reason: "trustline_missing" }
  return { ok: true }
}

type Jsonish = Record<string, unknown>

/** Extrae `extras.result_codes` de errores típicos de `Horizon.Server#submitTransaction`. */
export function horizonSubmitErrorDetail(err: unknown): Jsonish | string {
  if (!err || typeof err !== "object") return String(err)
  const e = err as {
    message?: string
    response?: { data?: HorizonStyleTxFailed; status?: number; statusText?: string }
  }
  const data = e.response?.data
  if (data && typeof data === "object" && "extras" in data) {
    const ex = (data as HorizonStyleTxFailed).extras
    if (ex?.result_codes) {
      return {
        message: e.message,
        httpStatus: e.response?.status,
        result_codes: ex.result_codes,
        title: (data as { title?: string }).title,
        detail: (data as { detail?: string }).detail,
      }
    }
  }
  return e.message ?? JSON.stringify(err)
}

type HorizonStyleTxFailed = {
  extras?: { result_codes?: { transaction?: string; operations?: string[] } }
  title?: string
  detail?: string
}

export function logHorizonSubmitError(tag: string, err: unknown): void {
  console.error(`[${tag}] Horizon submitTransaction failed`, horizonSubmitErrorDetail(err))
}

export function logUnknownStellarError(tag: string, err: unknown): void {
  console.error(`[${tag}]`, err instanceof Error ? err.stack ?? err.message : err)
}

/** Texto breve para API cuando `getTransaction` devuelve FAILED (mint Soroban). */
export function summarizeSorobanFailedMint(st: rpc.Api.GetFailedTransactionResponse): string {
  const parts: string[] = [`ledger=${st.ledger}`]
  try {
    const results = st.resultXdr?.result()?.results()
    const first = results?.[0]
    if (first) {
      const tr = first.tr()
      const sw = tr?.switch()
      if (sw != null) parts.push(`op=${sw.name}`)
    }
  } catch {
    /* XDR opcional */
  }
  return parts.join(" · ")
}
