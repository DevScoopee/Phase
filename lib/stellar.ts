/**
 * Stellar clásico (Horizon) — asset PHASELQ alineado con TrustlineButton / stellar.toml.
 * TrustlineButton usa el `asset` devuelto por GET /api/classic-liq; ese endpoint debe usar
 * la misma resolución que aquí cuando no hay CLASSIC_LIQ_ISSUER_SECRET.
 */

import { Asset, rpc, scValToNative, StrKey, xdr } from "@stellar/stellar-sdk"
import {
  classicLiqAssetConfigFromPublicEnv,
  classicLiqCodeForStellarToml,
  classicLiqIssuerForStellarToml,
  readClassicWalletStatus,
  type ClassicLiqAsset,
} from "@/lib/classic-liq"

/**
 * Activo clásico para trustline / comprobaciones Horizon: si NEXT_PUBLIC_* está completo,
 * coincide con Freighter; si no, cae al mismo emisor por defecto que `stellar.toml` (GAX… + PHASELQ).
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
 * Usar en rutas que envían PHASELQ clásico (p. ej. bootstrap issuer → wallet).
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

function safeScValNative(v: xdr.ScVal): string | null {
  try {
    const n = scValToNative(v)
    if (n === null || n === undefined) return null
    if (typeof n === "bigint") return n.toString()
    if (typeof n === "object") return JSON.stringify(n)
    return String(n)
  } catch {
    return null
  }
}

/** Texto breve para API cuando `getTransaction` devuelve FAILED (mint Soroban). */
export function summarizeSorobanFailedMint(st: rpc.Api.GetFailedTransactionResponse): string {
  const parts: string[] = [`ledger=${st.ledger}`]
  let ihfName: string | undefined
  try {
    const results = st.resultXdr?.result()?.results()
    const first = results?.[0]
    if (first) {
      const tr = first.tr()
      parts.push(`op=${tr.switch().name}`)
      if (tr.switch().name === "invokeHostFunction") {
        try {
          const ihr = tr.invokeHostFunctionResult()
          ihfName = ihr.switch().name
          parts.push(`ihf=${ihfName}`)
        } catch {
          parts.push("ihf=?")
        }
      }
    }
  } catch {
    parts.push("op=?")
  }

  const evs = st.diagnosticEventsXdr
  if (evs?.length) {
    const fragments: string[] = []
    const start = Math.max(0, evs.length - 14)
    for (let i = start; i < evs.length; i++) {
      try {
        const ce = evs[i]!.event()
        const body = ce.body().v0()
        const topics = body.topics()
        const tNat = topics.map((t) => safeScValNative(t)).filter(Boolean) as string[]
        const dNat = safeScValNative(body.data())
        const chunk = [...tNat, dNat].filter(Boolean).join("·")
        if (chunk) fragments.push(chunk)
      } catch {
        /* siguiente evento */
      }
    }
    const tail = fragments.slice(-5).join(" || ")
    if (tail) parts.push(`diag=${tail.slice(0, 480)}`)
  }

  if (ihfName === "invokeHostFunctionTrapped") {
    parts.push(
      "nota=ihf_trapped: el WASM del contrato abortó (p. ej. Unauthorized, límite supply, panic). Verifica que ADMIN_SECRET_KEY sea el minter del TOKEN_ADDRESS desplegado y que el contrato coincida con testnet.",
    )
  }

  return parts.join(" · ")
}
