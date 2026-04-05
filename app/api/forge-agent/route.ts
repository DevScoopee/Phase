import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai"
import { NextRequest, NextResponse } from "next/server"
import {
  Address,
  extractBaseAddress,
  FeeBumpTransaction,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk"
import {
  decodePaymentHeader,
  PaymentPayloadSchema,
  PaymentRequirementsSchema,
  useFacilitator,
  type PaymentRequirements,
} from "x402-stellar"
import {
  getPhaseProtocolConfigFromChain,
  NETWORK_PASSPHRASE,
  phaseProtocolContractIdForServer,
  READONLY_SIM_SOURCE_G,
  PHASER_LIQ_SYMBOL,
  REQUIRED_AMOUNT,
  RPC_URL,
  stroopsToLiqDisplay,
  tokenContractIdForServer,
} from "@/lib/phase-protocol"
import { logUnknownStellarError } from "@/lib/stellar"
import { warnPhaserLiqSacMismatchOnce } from "@/lib/phaser-liq-sac-warn"
import {
  generateForgeImageUrlViaNanobananaApi,
  nanobananaApiKeyConfigured,
} from "@/lib/forge-nanobanana"

export const runtime = "nodejs"
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const PHASE_PROTOCOL_CONTRACT = phaseProtocolContractIdForServer()
const PHASE_LIQ_TOKEN_CONTRACT = tokenContractIdForServer()

const X402_NETWORK = "stellar:testnet"

function forgePriceDisplay(): string {
  return `${stroopsToLiqDisplay(REQUIRED_AMOUNT)} ${PHASER_LIQ_SYMBOL}`
}

/** Estilo unificado para Nano Banana (imagen) — blueprint / isométrico / cyber-brutalist. */
const FORGE_IMAGE_STYLE_BLOCK =
  " Visual style: cyber-brutalist, isometric 3D, technical blueprint schematic, glowing neon cyan accents on deep black, high fidelity, sharp edges, minimal glitch accents."

/** Mismo lenguaje visual en URL de Pollinations si Nano Banana va en sobrecarga/cuota. */
const POLLINATIONS_STYLE_SUFFIX =
  ", dark cyber-brutalist aesthetic, glowing neon cyan, minimalist glitch art, isometric 3d blueprint schematic, high detail"

const ERR_SETTLEMENT_REJECTED_BY_FACILITATOR = "[ ERROR: SETTLEMENT_REJECTED_BY_FACILITATOR ]"
const ERR_NANO_BANANA_CORE_OVERLOAD = "[ ERROR: NANO_BANANA_CORE_OVERLOAD ]"
type ForgeImageStyleMode = "adaptive" | "cyber"

function normalizeForgeImageStyleMode(raw: unknown): ForgeImageStyleMode {
  if (typeof raw !== "string") return "adaptive"
  const v = raw.trim().toLowerCase()
  if (v === "cyber" || v === "ai_cyber" || v === "ai-cyber") return "cyber"
  return "adaptive"
}

function composeForgeImagePrompt(userPrompt: string, styleMode: ForgeImageStyleMode): string {
  const trimmed = userPrompt.trim()
  if (!trimmed) return ""
  if (styleMode === "cyber") return `${trimmed}.${FORGE_IMAGE_STYLE_BLOCK}`
  return trimmed
}

type ForgeAgentBody = {
  prompt?: string
  settlementTxHash?: string
  payerAddress?: string
  imageStyleMode?: ForgeImageStyleMode | string
}

type LegacyChallenge = {
  protocol: "x402"
  version: "2"
  network: string
  token: string
  contract_id: string
  token_contract: string
  amount: number
  priceDisplay: string
  facilitator: string
  invoice: string
  resource: string
  note: string
}

type ForgeAgentPaymentRequiredResponse = {
  success: false
  error: "Payment Required"
  priceDisplay: string
  message: string
  challenge: LegacyChallenge
  paymentRequirements?: PaymentRequirements
}

type ForgeAgentErrorResponse = {
  success: false
  error: string
  detail?: string
}

function facilitatorUrl(request: NextRequest): string {
  const configured = process.env.X402_FACILITATOR_URL?.trim()
  if (configured) return configured
  return `${request.nextUrl.origin}/api/x402`
}

function parseRequiredAmountInt(): number {
  const parsed = Number.parseInt(REQUIRED_AMOUNT, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function buildLegacyChallenge(request: NextRequest): LegacyChallenge {
  return {
    protocol: "x402",
    version: "2",
    network: X402_NETWORK,
    /** Contrato SAC PHASELQ (lo que se transfiere en `settle`). */
    token: PHASE_LIQ_TOKEN_CONTRACT,
    /** Contrato del protocolo PHASE (`settle` / NFT). */
    contract_id: PHASE_PROTOCOL_CONTRACT,
    token_contract: PHASE_LIQ_TOKEN_CONTRACT,
    amount: parseRequiredAmountInt(),
    priceDisplay: forgePriceDisplay(),
    facilitator: facilitatorUrl(request),
    invoice: `forge_${Date.now()}`,
    resource: request.nextUrl.pathname,
    note: "Payment in PHASELQ via PHASE protocol `settle` on-chain, or x402 exact payment per paymentRequirements.",
  }
}

function buildOfficialPaymentRequirements(request: NextRequest): PaymentRequirements | null {
  try {
    const resource = `${request.nextUrl.origin}/api/forge-agent`
    const payTo = process.env.X402_FORGE_PAY_TO?.trim() || READONLY_SIM_SOURCE_G
    return PaymentRequirementsSchema.parse({
      scheme: "exact",
      network: "stellar-testnet",
      maxAmountRequired: REQUIRED_AMOUNT,
      resource,
      description:
        "PHASELQ (Soroban) — pago x402 exact para el agente de forja. Alternativa: incluye settlementTxHash + payerAddress tras un settle exitoso en el contrato PHASE.",
      mimeType: "application/json",
      payTo,
      maxTimeoutSeconds: 600,
      asset: PHASE_LIQ_TOKEN_CONTRACT,
      extra: {
        phaserLiqContract: PHASE_LIQ_TOKEN_CONTRACT,
        phaseProtocolContract: PHASE_PROTOCOL_CONTRACT,
        requiredAmountStroops: REQUIRED_AMOUNT,
      },
    })
  } catch {
    return null
  }
}

function forgeAgentPaymentRequired(
  request: NextRequest,
  paymentRequirements: PaymentRequirements | null,
): NextResponse<ForgeAgentPaymentRequiredResponse> {
  const challenge = buildLegacyChallenge(request)
  const challengeBase64 = Buffer.from(JSON.stringify(challenge)).toString("base64")
  const facilitator = facilitatorUrl(request)

  const body: ForgeAgentPaymentRequiredResponse = {
    success: false,
    error: "Payment Required",
    priceDisplay: forgePriceDisplay(),
    message:
      "Se requiere pago en PHASELQ (challenge x402 + opcional paymentRequirements Stellar). Tras confirmar on-chain, reintenta con el header Authorization o con settlementTxHash en el body.",
    challenge,
  }
  if (paymentRequirements) {
    body.paymentRequirements = paymentRequirements
  }

  return NextResponse.json(body, {
    status: 402,
    headers: {
      "WWW-Authenticate": `x402 token="${challengeBase64}", amount="${challenge.amount}", facilitator="${facilitator}", network="${X402_NETWORK}"`,
      "X-Required-Amount": REQUIRED_AMOUNT,
      "X-Token-Address": PHASE_LIQ_TOKEN_CONTRACT,
      "X-Facilitator": facilitator,
      "X-X402-Network": X402_NETWORK,
    },
  })
}

async function verifyOfficialX402(
  rawHeader: string,
  paymentRequirements: PaymentRequirements,
): Promise<boolean> {
  let decoded: unknown
  try {
    decoded = decodePaymentHeader<unknown>(rawHeader)
  } catch {
    return false
  }
  const parsed = PaymentPayloadSchema.safeParse(decoded)
  if (!parsed.success) return false

  const facilitatorUrlConfigured = process.env.X402_FACILITATOR_URL?.trim()
  const { verify: verifyPayment } = useFacilitator(
    facilitatorUrlConfigured ? { url: facilitatorUrlConfigured } : undefined,
  )
  const res = await verifyPayment(parsed.data, paymentRequirements)
  return res.isValid === true
}

/** ScSymbol en XDR suele traer `\0` de relleno; sin normalizar nunca coincide con `"settle"`. */
function normalizeContractFunctionName(fn: string | Buffer | Uint8Array | unknown): string {
  if (typeof fn === "string") return fn.replace(/\0/g, "").trim()
  if (Buffer.isBuffer(fn)) return fn.toString("utf8").replace(/\0/g, "").trim()
  if (fn instanceof Uint8Array) return Buffer.from(fn).toString("utf8").replace(/\0/g, "").trim()
  return String(fn ?? "")
    .replace(/\0/g, "")
    .trim()
}

function logForgeAgentSorobanTxNotSuccess(txHash: string, res: rpc.Api.GetTransactionResponse) {
  const row: Record<string, unknown> = { context: "forge-agent settle verify", hash: txHash, status: res.status }
  if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
    const f = res as rpc.Api.GetFailedTransactionResponse
    row.ledger = f.ledger
    try {
      const tr = f.resultXdr?.result()?.results()?.[0]?.tr()
      if (tr?.switch) row.opResult = tr.switch().name
    } catch {
      /* XDR shape puede variar */
    }
  }
  console.error("[forge-agent] Soroban getTransaction: not SUCCESS", JSON.stringify(row))
}

function normalizeAccountG(g: string): string {
  return g.trim().toUpperCase()
}

/** G… comparable: V1 txs pueden usar source muxed (M…); Freighter suele mandar G… */
function comparableEd25519AccountG(addr: string): string {
  const t = addr.trim()
  if (!t) return ""
  try {
    return extractBaseAddress(t).trim().toUpperCase()
  } catch {
    return t.toUpperCase()
  }
}

function normalizeContractC(id: string): string {
  return id.trim().toUpperCase()
}

/**
 * Monto i128 en args de `settle`. `scValToNative` a veces devuelve `{ hi, lo }` u otro shape;
 * `BigInt(String(raw))` fallaba y la verificación devolvía false → segundo POST seguía en 402.
 */
function sorobanAmountScValToBigInt(sc: xdr.ScVal): bigint | null {
  const u64Mask = (BigInt(1) << BigInt(64)) - BigInt(1)
  try {
    const native = scValToNative(sc)
    if (typeof native === "bigint") return native
    if (typeof native === "number" && Number.isFinite(native)) return BigInt(Math.trunc(native))
    if (typeof native === "string") {
      const t = native.trim()
      if (/^-?\d+$/.test(t)) return BigInt(t)
    }
    if (native && typeof native === "object") {
      const o = native as Record<string, unknown>
      const loVal = o.lo ?? o.LO
      const hiVal = o.hi ?? o.HI
      if (loVal !== undefined || hiVal !== undefined) {
        const lo = BigInt(String(loVal ?? 0))
        const hi = BigInt(String(hiVal ?? 0))
        return (hi << BigInt(64)) | (lo & u64Mask)
      }
    }
  } catch {
    /* intentar XDR directo */
  }
  try {
    const parts = sc.i128()
    const hi = BigInt(parts.hi().toString())
    const lo = BigInt(parts.lo().toString())
    return (hi << BigInt(64)) | (lo & u64Mask)
  } catch {
    return null
  }
}

/**
 * Comprueba en RPC que el pago fue un `invokeHostFunction` → **settle** en **PHASE_PROTOCOL_CONTRACT**
 * (protocolo PHASE), con `PHASE_LIQ_TOKEN_CONTRACT` y monto ≥ REQUIRED_AMOUNT.
 * Este endpoint **no** firma ni llama `mint` ni `transfer` del token; el mint del faucet va en `app/api/faucet/route.ts`.
 */
async function verifyPhaseSettleTxOnChain(
  txHash: string,
  payerAddress: string,
): Promise<boolean> {
  const payer = payerAddress.trim()
  const payerComparable = comparableEd25519AccountG(payer)
  if (!payerComparable.startsWith("G") || payerComparable.length !== 56) return false

  const chainCfg = await getPhaseProtocolConfigFromChain()
  const allowedSettleTokens = new Set<string>([PHASE_LIQ_TOKEN_CONTRACT])
  if (chainCfg?.tokenAddress) allowedSettleTokens.add(chainCfg.tokenAddress)
  const allowedTokenNorm = new Set([...allowedSettleTokens].map(normalizeContractC))
  const contractIdNorm = normalizeContractC(PHASE_PROTOCOL_CONTRACT)

  const server = new rpc.Server(RPC_URL)
  let res: rpc.Api.GetTransactionResponse
  try {
    res = await server.getTransaction(txHash.trim())
  } catch (e) {
    console.error(
      "[forge-agent] Soroban getTransaction threw",
      JSON.stringify({ hash: txHash.trim(), error: e instanceof Error ? e.message : String(e) }),
    )
    return false
  }
  if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    logForgeAgentSorobanTxNotSuccess(txHash.trim(), res)
    return false
  }

  const parsed = TransactionBuilder.fromXDR(res.envelopeXdr, NETWORK_PASSPHRASE)
  const tx = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed
  const sourceG = typeof tx.source === "string" ? tx.source.trim() : ""
  const sourceComparable = comparableEd25519AccountG(sourceG)
  if (
    !sourceComparable.startsWith("G") ||
    sourceComparable.length !== 56 ||
    sourceComparable !== payerComparable
  ) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[forge-agent] settle verify: tx.source mismatch",
        JSON.stringify({ sourceRaw: sourceG, sourceComparable, payerComparable }),
      )
    }
    return false
  }

  for (const op of tx.operations) {
    if (op.type !== "invokeHostFunction") continue
    const hf = op.func
    if (hf.switch().name !== "hostFunctionTypeInvokeContract") {
      continue
    }
    const ic = hf.invokeContract()
    const contractAddr = Address.fromScAddress(ic.contractAddress()).toString()
    if (normalizeContractC(contractAddr) !== contractIdNorm) continue

    const fn = normalizeContractFunctionName(ic.functionName())
    if (fn !== "settle") continue

    const args = ic.args()
    if (!args || args.length < 3) continue

    let userG: string
    try {
      userG = Address.fromScVal(args[0]).toString()
    } catch {
      continue
    }
    if (comparableEd25519AccountG(userG) !== payerComparable) continue

    let tokenC: string
    try {
      tokenC = Address.fromScVal(args[1]).toString()
    } catch {
      continue
    }
    if (!allowedTokenNorm.has(normalizeContractC(tokenC))) continue

    const amountBi = sorobanAmountScValToBigInt(args[2])
    if (amountBi === null) continue
    if (amountBi < BigInt(REQUIRED_AMOUNT)) continue
    return true
  }

  return false
}

/**
 * Cliente envía `Authorization: x402 <base64(JSON)>` con
 * `{ settlementTxHash, payerAddress }` tras el settle en Freighter.
 */
function tryPhaseProofFromAuthHeader(authHeader: string | null): {
  settlementTxHash: string
  payerAddress: string
} | null {
  if (!authHeader?.toLowerCase().startsWith("x402 ")) return null
  const raw = authHeader.slice(5).trim()
  if (!raw) return null
  try {
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as unknown
    if (!json || typeof json !== "object") return null
    const o = json as Record<string, unknown>
    const settlementTxHash = typeof o.settlementTxHash === "string" ? o.settlementTxHash.trim() : ""
    const payerAddress = typeof o.payerAddress === "string" ? o.payerAddress.trim() : ""
    if (!settlementTxHash || !payerAddress) return null
    return { settlementTxHash, payerAddress }
  } catch {
    return null
  }
}

type ForgePaymentResolution = "paid" | "missing" | "facilitator_rejected"

/** Cuenta fuente (G…) de un tx Soroban exitoso; sirve si el cliente solo envía `settlementTxHash`. */
async function sorobanSuccessfulTxSourcePublicKey(txHash: string): Promise<string | null> {
  const h = txHash.trim()
  if (!h) return null
  const server = new rpc.Server(RPC_URL)
  let res: rpc.Api.GetTransactionResponse
  try {
    res = await server.getTransaction(h)
  } catch {
    return null
  }
  if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS) return null
  try {
    const parsed = TransactionBuilder.fromXDR(res.envelopeXdr, NETWORK_PASSPHRASE)
    const tx = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed
    const src = typeof tx.source === "string" ? tx.source.trim() : ""
    if (!src) return null
    try {
      const g = extractBaseAddress(src).trim()
      return g.startsWith("G") && g.length === 56 ? g : null
    } catch {
      return null
    }
  } catch {
    return null
  }
}

/** `Authorization: Bearer <settlementTxHash>` (compat); el hash debe coincidir con el body si ambos vienen. */
function parseBearerSettlementTxHash(authHeader: string | null): string | null {
  const h = authHeader?.trim()
  if (!h) return null
  if (!h.toLowerCase().startsWith("bearer ")) return null
  const token = h.slice(7).trim()
  return token || null
}

/**
 * Recibo on-chain post-settle: body, `Bearer`, o prueba PHASE `x402`+base64 (mismo JSON que envía el frontend).
 * Si hay valor, el POST puede confiar en él para demo (sin re-verificar Soroban) — ver `POST`.
 */
function extractSettlementReceiptTxHash(authHeader: string | null, body: ForgeAgentBody): string {
  const fromBody = body.settlementTxHash?.trim() ?? ""
  if (fromBody) return fromBody
  const bearer = parseBearerSettlementTxHash(authHeader)
  if (bearer) return bearer
  const phase = tryPhaseProofFromAuthHeader(authHeader)
  return phase?.settlementTxHash?.trim() ?? ""
}

/**
 * Orden: body settle (+ Bearer opcional) → prueba PHASE `x402` en Authorization → pago x402 oficial vía facilitator.
 * `facilitator_rejected`: payload x402 oficial parseable pero verify devuelve inválido.
 */
async function resolveForgeAgentPayment(
  authHeader: string | null,
  body: ForgeAgentBody,
  paymentRequirements: PaymentRequirements | null,
): Promise<ForgePaymentResolution> {
  const bearerHash = parseBearerSettlementTxHash(authHeader)
  let settlementTx = body.settlementTxHash?.trim() ?? ""
  if (bearerHash) {
    if (settlementTx && settlementTx !== bearerHash) {
      if (process.env.NODE_ENV === "development") {
        console.error(
          "[forge-agent] settlementTxHash body vs Bearer mismatch",
          JSON.stringify({ body: settlementTx, bearer: bearerHash }),
        )
      }
      return "missing"
    }
    settlementTx = settlementTx || bearerHash
  }

  let payer = body.payerAddress?.trim()
  if (settlementTx) {
    if (!payer) {
      payer = (await sorobanSuccessfulTxSourcePublicKey(settlementTx)) ?? ""
    }
    if (payer) {
      try {
        const ok = await verifyPhaseSettleTxOnChain(settlementTx, payer)
        return ok ? "paid" : "missing"
      } catch (e) {
        logUnknownStellarError("forge-agent resolvePayment (body settle)", e)
        return "missing"
      }
    }
  }

  const phaseFromAuth = tryPhaseProofFromAuthHeader(authHeader)
  if (phaseFromAuth) {
    try {
      const ok = await verifyPhaseSettleTxOnChain(
        phaseFromAuth.settlementTxHash,
        phaseFromAuth.payerAddress,
      )
      return ok ? "paid" : "missing"
    } catch (e) {
      logUnknownStellarError("forge-agent resolvePayment (Authorization settle)", e)
      return "missing"
    }
  }

  if (!authHeader?.toLowerCase().startsWith("x402 ")) return "missing"
  const raw = authHeader.slice(5).trim()
  if (!raw) return "missing"
  if (!paymentRequirements) return "missing"

  let decoded: unknown
  try {
    decoded = decodePaymentHeader<unknown>(raw)
  } catch {
    return "missing"
  }
  const parsed = PaymentPayloadSchema.safeParse(decoded)
  if (!parsed.success) return "missing"

  try {
    const valid = await verifyOfficialX402(raw, paymentRequirements)
    return valid ? "paid" : "facilitator_rejected"
  } catch (e) {
    logUnknownStellarError("forge-agent resolvePayment (x402 verify)", e)
    return "facilitator_rejected"
  }
}

type ForgeAgentSuccessResponse = {
  success: true
  /** URL de imagen: data URL (Gemini) o https Pollinations si hubo respaldo. */
  imageUrl: string
  image_url: string
  lore: string
  metadataStandard: "SEP-20"
  /**
   * `nanobanana_api` = imagen vía api.nanobananaapi.ai;
   * `gemini` = imagen vía Google Gemini;
   * `pollinations_fallback` = cuota/overload o fallo tras intentos anteriores.
   */
  image_source: "nanobanana_api" | "gemini" | "pollinations_fallback"
}

type ForgeAgentResponse =
  | ForgeAgentSuccessResponse
  | ForgeAgentPaymentRequiredResponse
  | ForgeAgentErrorResponse

function buildPollinationsImageUrl(userPrompt: string, styleMode: ForgeImageStyleMode): string {
  const basePrompt = userPrompt.trim()
  const imagePrompt = styleMode === "cyber" ? `${basePrompt}${POLLINATIONS_STYLE_SUFFIX}` : basePrompt
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1024&height=1024&nologo=true`
}

/** Por defecto sí: si Nano Banana está en 429/cuota, se sirve imagen vía Pollinations sin fallar el POST. */
function forgePollinationsFallbackEnabled(): boolean {
  const v = process.env.FORGE_DISABLE_POLLINATIONS_FALLBACK?.trim().toLowerCase()
  return v !== "1" && v !== "true" && v !== "yes"
}

/** Claves de Google Generative Language suelen empezar por `AIza` (AI Studio / Cloud). */
function looksLikeGoogleGeminiApiKey(raw: string | undefined): boolean {
  const k = raw?.trim().replace(/^["']|["']$/g, "") ?? ""
  return k.startsWith("AIza") && k.length >= 35
}

/** Lore: solo claves válidas Gemini; si `GOOGLE_AI_STUDIO_API_KEY` no es Google (p. ej. otra API), usa `GEMINI_API_KEY`. */
function forgeGoogleAiApiKey(): string | null {
  const studio = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim()
  const legacy = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, "")
  if (looksLikeGoogleGeminiApiKey(studio)) return studio!.trim().replace(/^["']|["']$/g, "")
  if (looksLikeGoogleGeminiApiKey(legacy)) {
    if (studio && !looksLikeGoogleGeminiApiKey(studio) && process.env.NODE_ENV === "development") {
      console.warn(
        "[forge-agent] GOOGLE_AI_STUDIO_API_KEY no es clave Gemini (debe ser AIza… desde Google AI Studio); usando GEMINI_API_KEY.",
      )
    }
    return legacy!
  }
  return null
}

/** Quita `models/` si vino pegado desde consola / REST; el SDK ya arma `models/<id>` cuando hace falta. */
function cleanGeminiModelId(raw: string): string {
  return raw.trim().replace(/^models\//i, "").trim()
}

function geminiModelId(): string {
  const fromEnv = process.env.GEMINI_MODEL?.trim()
  return fromEnv && fromEnv.length > 0 ? cleanGeminiModelId(fromEnv) : "gemini-3-flash"
}

function forgeGeminiImageModelId(): string {
  const fromEnv = process.env.GEMINI_IMAGE_MODEL?.trim()
  return fromEnv && fromEnv.length > 0 ? cleanGeminiModelId(fromEnv) : "gemini-3.1-flash-image-preview"
}

/**
 * Gemini 3 suele exponerse antes en `v1beta`; `v1` cuando Google lo estabiliza.
 * Override: `GEMINI_API_VERSION=v1` | `GEMINI_API_VERSION=v1beta`
 */
function geminiGenerateRequestOptions(): { apiVersion: "v1" | "v1beta" } {
  const raw = process.env.GEMINI_API_VERSION?.trim().toLowerCase()
  if (raw === "v1" || raw === "v1beta") return { apiVersion: raw }
  return { apiVersion: "v1beta" }
}

/** Lore cyber-brutalist: umbrales al mínimo para no vaciar respuestas por sensibilidad. */
const FORGE_GEMINI_SAFETY_SETTINGS = (
  [
    HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    HarmCategory.HARM_CATEGORY_HARASSMENT,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
  ] as const
).map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }))

/**
 * Fallbacks de lore tras `GEMINI_MODEL` / default. Evitar gemini-1.5-*: muchas cuentas devuelven 404 en v1beta.
 * Orden: 2.5 (actual), 2.5 liviano, 2.0.
 */
const GEMINI_KNOWN_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const

function geminiModelCandidates(): string[] {
  const primary = geminiModelId()
  const out: string[] = []
  const seen = new Set<string>()
  const add = (id: string) => {
    const t = cleanGeminiModelId(id)
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  add(primary)
  for (const m of GEMINI_KNOWN_FALLBACK_MODELS) add(m)
  return out
}

/** Errores que no mejoran probando otro modelo (misma cuenta / misma clave). */
function isGeminiNonRetryableAcrossModels(error: unknown): boolean {
  const e = error as { status?: number; message?: string }
  const status = typeof e?.status === "number" ? e.status : null
  const msg = (typeof e?.message === "string" ? e.message : String(error ?? "")).toLowerCase()
  if (status === 401 || status === 403) return true
  if (/api key not valid|invalid api key|permission denied|unauthenticated|forbidden\b/i.test(msg)) return true
  return false
}

/** Créditos agotados, cuota, rate limit u overload del núcleo de imagen (Nano Banana). */
function isNanoBananaCoreOverloadError(error: unknown): boolean {
  const e = error as { status?: number; message?: string; code?: number | string }
  const status = typeof e?.status === "number" ? e.status : null
  const codeNum = typeof e?.code === "number" ? e.code : null
  const msg = (typeof e?.message === "string" ? e.message : String(error ?? "")).toLowerCase()
  if (status === 429 || codeNum === 429) return true
  if (status === 503 || status === 529) return true
  return (
    /\b429\b|\b503\b|quota|resource_exhausted|rate.?limit|too many requests|billing|credit|exhausted|overload|capacity/i.test(
      msg,
    )
  )
}

type GeminiPart = {
  inlineData?: { mimeType?: string; data?: string }
  inline_data?: { mime_type?: string; data?: string }
  text?: string
}

function extractImageDataUrlFromGeminiResponse(response: { candidates?: { content?: { parts?: GeminiPart[] } }[] }): string | null {
  const parts = response.candidates?.[0]?.content?.parts
  if (!parts?.length) return null
  for (const part of parts) {
    const id = part.inlineData ?? part.inline_data
    if (!id?.data) continue
    const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? "image/png"
    if (mime.startsWith("image/")) {
      return `data:${mime};base64,${id.data}`
    }
  }
  return null
}

/**
 * Imagen vía Google Gemini (`gemini-3.1-flash-image-preview` por defecto): v1beta + modalidad IMAGE.
 */
async function generateForgeImageDataUrl(genAI: GoogleGenerativeAI, imagePrompt: string): Promise<string> {
  const fullPrompt = imagePrompt.trim()
  const imageModelId = forgeGeminiImageModelId()
  const imageGenerationConfig = {
    responseModalities: ["IMAGE"],
    imageConfig: {
      aspectRatio: "1:1",
      imageSize: "2K",
    },
  }

  const model = genAI.getGenerativeModel(
    {
      model: imageModelId,
      safetySettings: FORGE_GEMINI_SAFETY_SETTINGS,
      // GenerationConfig del SDK aún no tipa responseModalities / imageConfig; la API v1beta sí.
      generationConfig: imageGenerationConfig as import("@google/generative-ai").GenerationConfig,
    },
    geminiGenerateRequestOptions(),
  )

  let res: Awaited<ReturnType<typeof model.generateContent>>
  try {
    res = await model.generateContent(fullPrompt)
  } catch (e) {
    if (isNanoBananaCoreOverloadError(e)) {
      throw new Error("NANO_BANANA_CORE_OVERLOAD")
    }
    throw e
  }

  const raw = res.response as unknown as { candidates?: { content?: { parts?: GeminiPart[] } }[] }
  const dataUrl = extractImageDataUrlFromGeminiResponse(raw)
  if (!dataUrl) {
    throw new Error("GEMINI_IMAGE_EMPTY: el modelo no devolvió datos de imagen")
  }
  return dataUrl
}

async function runForgeAgentCore(
  userPrompt: string,
  styleMode: ForgeImageStyleMode,
  nanobananaCallBackUrl: string,
): Promise<ForgeAgentSuccessResponse> {
  const trimmed = userPrompt.trim()
  if (!trimmed) {
    throw new Error("EMPTY_PROMPT")
  }

  const apiKey = forgeGoogleAiApiKey()
  if (!apiKey) {
    throw new Error("MISSING_GOOGLE_AI_KEY")
  }
  const genAI = new GoogleGenerativeAI(apiKey)
  const candidates = geminiModelCandidates()

  const systemInstruction =
    styleMode === "cyber"
      ? `Eres el Arquitecto del Protocolo PHASE. Escribe una descripción de máximo 2 oraciones técnicas, oscuras, ciberpunk y enigmáticas sobre el siguiente artefacto forjado por el usuario: ${trimmed}`
      : `Eres el Arquitecto del Protocolo PHASE. Escribe una descripción breve (máximo 2 oraciones) alineada a la idea exacta del usuario, sin imponer estética cyber por defecto: ${trimmed}`

  type GeminiGenerateResult = Awaited<
    ReturnType<ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["generateContent"]>
  >
  let geminiResult: GeminiGenerateResult | undefined
  let resolvedModelId = candidates[0] ?? geminiModelId()

  for (let i = 0; i < candidates.length; i++) {
    const modelId = candidates[i]!
    resolvedModelId = modelId
    try {
      const model = genAI.getGenerativeModel(
        { model: modelId, safetySettings: FORGE_GEMINI_SAFETY_SETTINGS },
        geminiGenerateRequestOptions(),
      )
      geminiResult = await model.generateContent(systemInstruction)
      if (i > 0) {
        console.warn("[forge-agent] Gemini: modelo alternativo OK", { modelId, triedAfterFailure: true })
      }
      break
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn("[forge-agent] Gemini generateContent failed", {
        modelId,
        attempt: i + 1,
        total: candidates.length,
        msg,
      })
      if (isGeminiNonRetryableAcrossModels(e)) {
        throw new Error(`GEMINI_GENERATE_FAILED: ${msg}`)
      }
      if (i === candidates.length - 1) {
        throw new Error(`GEMINI_GENERATE_FAILED: ${msg}`)
      }
    }
  }

  if (!geminiResult) {
    throw new Error("GEMINI_GENERATE_FAILED: ningún modelo en la cadena pudo generar contenido")
  }

  let lore = ""
  try {
    lore = geminiResult.response.text().trim()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[forge-agent] Gemini response.text() failed", { model: resolvedModelId, msg })
    throw new Error(`GEMINI_EMPTY_RESPONSE: ${msg}`)
  }
  if (!lore) {
    throw new Error("GEMINI_EMPTY_LORE: el modelo no devolvió texto (revisa cuota o safety).")
  }

  const imagePromptForApis = composeForgeImagePrompt(trimmed, styleMode)

  function tryPollinationsOnOverload(e: unknown): boolean {
    const overload =
      (e instanceof Error && e.message === "NANO_BANANA_CORE_OVERLOAD") ||
      isNanoBananaCoreOverloadError(e)
    if (!overload) return false
    if (!forgePollinationsFallbackEnabled()) throw new Error("NANO_BANANA_CORE_OVERLOAD")
    console.warn(
      "[forge-agent] Imagen (NanoBanana API o Gemini) en sobrecarga/cuota; usando Pollinations como respaldo",
    )
    return true
  }

  const { imageUrl, image_source } = await (async (): Promise<{
    imageUrl: string
    image_source: ForgeAgentSuccessResponse["image_source"]
  }> => {
    if (nanobananaApiKeyConfigured()) {
      try {
        const url = await generateForgeImageUrlViaNanobananaApi({
          prompt: imagePromptForApis,
          callBackUrl: nanobananaCallBackUrl,
        })
        return { imageUrl: url, image_source: "nanobanana_api" }
      } catch (e) {
        if (tryPollinationsOnOverload(e)) {
          return {
            imageUrl: buildPollinationsImageUrl(trimmed, styleMode),
            image_source: "pollinations_fallback",
          }
        }
        console.warn("[forge-agent] NanoBanana API (nanobananaapi.ai) falló; probando imagen Gemini", e)
      }
    }

    try {
      const url = await generateForgeImageDataUrl(genAI, imagePromptForApis)
      return { imageUrl: url, image_source: "gemini" }
    } catch (e) {
      if (tryPollinationsOnOverload(e)) {
        return {
          imageUrl: buildPollinationsImageUrl(trimmed, styleMode),
          image_source: "pollinations_fallback",
        }
      }
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[forge-agent] Gemini image generation failed", { msg })
      throw new Error(`GEMINI_IMAGE_FAILED: ${msg}`)
    }
  })()

  return {
    success: true,
    imageUrl,
    image_url: imageUrl,
    lore,
    metadataStandard: "SEP-20",
    image_source,
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ForgeAgentResponse>> {
  let body: ForgeAgentBody
  try {
    body = (await request.json()) as ForgeAgentBody
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 })
  }

  if (!forgeGoogleAiApiKey()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "GOOGLE_AI_STUDIO_API_KEY (o GEMINI_API_KEY) no configurada en el servidor. Crea clave en Google AI Studio.",
      },
      { status: 503 },
    )
  }

  warnPhaserLiqSacMismatchOnce(PHASE_LIQ_TOKEN_CONTRACT, "forge-agent")

  const paymentRequirements = buildOfficialPaymentRequirements(request)
  const auth = request.headers.get("authorization")
  const settlementReceiptTxHash = extractSettlementReceiptTxHash(auth, body)
  console.log(
    "[FORGE-AGENT] Petición recibida. settlementTxHash:",
    settlementReceiptTxHash || "Ninguno",
  )

  if (settlementReceiptTxHash) {
    console.log(
      `[FORGE-AGENT] Recibo detectado (${settlementReceiptTxHash}). Procediendo a forjar con IA (demo: sin re-verificación on-chain).`,
    )
  } else {
    console.log("[FORGE-AGENT] No hay recibo on-chain. Resolviendo pago x402 / facilitator…")
    const payment = await resolveForgeAgentPayment(auth, body, paymentRequirements)

    if (payment === "facilitator_rejected") {
      return NextResponse.json({ success: false, error: ERR_SETTLEMENT_REJECTED_BY_FACILITATOR }, { status: 403 })
    }
    if (payment === "missing") {
      return forgeAgentPaymentRequired(request, paymentRequirements)
    }
  }

  if (typeof body.prompt !== "string") {
    return NextResponse.json({ success: false, error: "Falta prompt (string)" }, { status: 400 })
  }

  try {
    const nanobananaCallBackUrl =
      process.env.NANOBANANA_CALLBACK_URL?.trim() ||
      `${request.nextUrl.origin}/api/webhooks/nanobanana`
    const styleMode = normalizeForgeImageStyleMode(body.imageStyleMode)
    const payload = await runForgeAgentCore(body.prompt, styleMode, nanobananaCallBackUrl)
    return NextResponse.json(payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === "EMPTY_PROMPT") {
      return NextResponse.json({ success: false, error: "prompt vacío o inválido" }, { status: 400 })
    }
    if (msg === "MISSING_GOOGLE_AI_KEY") {
      return NextResponse.json(
        {
          success: false,
          error:
            "GOOGLE_AI_STUDIO_API_KEY (o GEMINI_API_KEY) no configurada en el servidor. Crea clave en Google AI Studio.",
        },
        { status: 503 },
      )
    }
    if (msg === "NANO_BANANA_CORE_OVERLOAD") {
      console.error("[forge-agent]", ERR_NANO_BANANA_CORE_OVERLOAD)
      return NextResponse.json({ success: false, error: ERR_NANO_BANANA_CORE_OVERLOAD }, { status: 503 })
    }
    if (msg.startsWith("GEMINI_")) {
      console.error("[forge-agent] Gemini error (500)", msg)
      return NextResponse.json(
        {
          success: false,
          error:
            "Fallo al generar lore con Gemini. Revisa GOOGLE_AI_STUDIO_API_KEY (o GEMINI_API_KEY) y GEMINI_MODEL en el servidor; los modelos 1.5 ya no están disponibles para todos los proyectos.",
          detail: process.env.NODE_ENV === "development" ? msg : undefined,
        },
        { status: 500 },
      )
    }
    console.error("[PROTOCOL_ERROR] Energía consumida, fallo de IA (500)", msg, e)
    return NextResponse.json(
      {
        success: false,
        error: "Fallo del agente IA (Gemini). El pago ya fue aceptado; revisar logs.",
        detail: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    )
  }
}
