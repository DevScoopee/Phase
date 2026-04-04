import { GoogleGenerativeAI } from "@google/generative-ai"
import { NextRequest, NextResponse } from "next/server"
import {
  Address,
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
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
  READONLY_SIM_SOURCE_G,
  REQUIRED_AMOUNT,
  RPC_URL,
  TOKEN_ADDRESS,
} from "@/lib/phase-protocol"
import { logUnknownStellarError } from "@/lib/stellar"
import { warnPhaserLiqSacMismatchOnce } from "@/lib/phaser-liq-sac-warn"

export const runtime = "nodejs"
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const X402_NETWORK = "stellar:testnet"
/** Texto fijo del paywall (spec producto). */
const FORGE_PRICE_DISPLAY = "1.00 PHASER_LIQ"

const IMAGE_STYLE_SUFFIX =
  ", dark cyber-brutalist aesthetic, glowing neon cyan, minimalist glitch art, isometric 3d"

type ForgeAgentBody = {
  prompt?: string
  settlementTxHash?: string
  payerAddress?: string
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
    token: CONTRACT_ID,
    contract_id: CONTRACT_ID,
    token_contract: TOKEN_ADDRESS,
    amount: parseRequiredAmountInt(),
    priceDisplay: FORGE_PRICE_DISPLAY,
    facilitator: facilitatorUrl(request),
    invoice: `forge_${Date.now()}`,
    resource: request.nextUrl.pathname,
    note: "Payment in PHASERLIQ via PHASE protocol `settle` on-chain, or x402 exact payment per paymentRequirements.",
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
        "PHASERLIQ (Soroban) — pago x402 exact para el agente de forja. Alternativa: incluye settlementTxHash + payerAddress tras un settle exitoso en el contrato PHASE.",
      mimeType: "application/json",
      payTo,
      maxTimeoutSeconds: 600,
      asset: TOKEN_ADDRESS,
      extra: {
        phaserLiqContract: TOKEN_ADDRESS,
        phaseProtocolContract: CONTRACT_ID,
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
    priceDisplay: FORGE_PRICE_DISPLAY,
    message:
      "Se requiere pago en PHASERLIQ (challenge x402 + opcional paymentRequirements Stellar). Tras confirmar on-chain, reintenta con el header Authorization o con settlementTxHash en el body.",
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
      "X-Token-Address": TOKEN_ADDRESS,
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

function functionNameToString(fn: string | Buffer): string {
  if (typeof fn === "string") return fn
  return fn.toString("utf8")
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

/**
 * Comprueba en RPC que el pago fue un `invokeHostFunction` → **settle** en **CONTRACT_ID**
 * (protocolo PHASE), con `TOKEN_ADDRESS` y monto ≥ REQUIRED_AMOUNT.
 * Este endpoint **no** firma ni llama `mint` ni `transfer` del token; el mint del faucet va en `app/api/faucet/route.ts`.
 */
async function verifyPhaseSettleTxOnChain(
  txHash: string,
  payerAddress: string,
): Promise<boolean> {
  const payer = payerAddress.trim()
  if (!payer.startsWith("G") || payer.length !== 56) return false

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
  if (tx.source !== payer) return false

  for (const op of tx.operations) {
    if (op.type !== "invokeHostFunction") continue
    const hf = op.func
    if (hf.switch().value !== xdr.HostFunctionType.hostFunctionTypeInvokeContract().value) {
      continue
    }
    const ic = hf.invokeContract()
    const contractAddr = Address.fromScAddress(ic.contractAddress()).toString()
    if (contractAddr !== CONTRACT_ID) continue

    const fn = functionNameToString(ic.functionName())
    if (fn !== "settle") continue

    const args = ic.args()
    if (!args || args.length < 3) continue

    let userG: string
    try {
      userG = Address.fromScVal(args[0]).toString()
    } catch {
      continue
    }
    if (userG !== payer) continue

    let tokenC: string
    try {
      tokenC = Address.fromScVal(args[1]).toString()
    } catch {
      continue
    }
    if (tokenC !== TOKEN_ADDRESS) continue

    let amountBi: bigint
    try {
      const rawAmt = scValToNative(args[2])
      if (typeof rawAmt === "bigint") amountBi = rawAmt
      else if (typeof rawAmt === "number" && Number.isFinite(rawAmt)) amountBi = BigInt(Math.trunc(rawAmt))
      else amountBi = BigInt(String(rawAmt))
    } catch {
      continue
    }
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

async function paymentValid(
  request: NextRequest,
  authHeader: string | null,
  body: ForgeAgentBody,
  paymentRequirements: PaymentRequirements | null,
): Promise<boolean> {
  const settlementTx = body.settlementTxHash?.trim()
  const payer = body.payerAddress?.trim()
  if (settlementTx && payer) {
    try {
      return await verifyPhaseSettleTxOnChain(settlementTx, payer)
    } catch (e) {
      logUnknownStellarError("forge-agent paymentValid (body settle)", e)
      return false
    }
  }

  const phaseFromAuth = tryPhaseProofFromAuthHeader(authHeader)
  if (phaseFromAuth) {
    try {
      return await verifyPhaseSettleTxOnChain(
        phaseFromAuth.settlementTxHash,
        phaseFromAuth.payerAddress,
      )
    } catch (e) {
      logUnknownStellarError("forge-agent paymentValid (Authorization settle)", e)
      return false
    }
  }

  if (!authHeader?.toLowerCase().startsWith("x402 ")) return false
  const raw = authHeader.slice(5).trim()
  if (!raw) return false

  if (!paymentRequirements) return false

  try {
    return await verifyOfficialX402(raw, paymentRequirements)
  } catch (e) {
    logUnknownStellarError("forge-agent paymentValid (x402 verify)", e)
    return false
  }
}

type ForgeAgentSuccessResponse = {
  success: true
  imageUrl: string
  lore: string
  metadataStandard: "SEP-20"
}

type ForgeAgentResponse =
  | ForgeAgentSuccessResponse
  | ForgeAgentPaymentRequiredResponse
  | ForgeAgentErrorResponse

function buildPollinationsImageUrl(userPrompt: string): string {
  const imagePrompt = `${userPrompt.trim()}${IMAGE_STYLE_SUFFIX}`
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1024&height=1024&nologo=true`
}

async function runForgeAgentCore(userPrompt: string): Promise<ForgeAgentSuccessResponse> {
  const trimmed = userPrompt.trim()
  if (!trimmed) {
    throw new Error("EMPTY_PROMPT")
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!.trim())
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

  const systemInstruction = `Eres el Arquitecto del Protocolo PHASE. Escribe una descripción de máximo 2 oraciones técnicas, oscuras, ciberpunk y enigmáticas sobre el siguiente artefacto forjado por el usuario: ${trimmed}`

  const geminiResult = await model.generateContent(systemInstruction)
  const lore = geminiResult.response.text().trim()

  const imageUrl = buildPollinationsImageUrl(trimmed)

  return {
    success: true,
    imageUrl,
    lore,
    metadataStandard: "SEP-20",
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ForgeAgentResponse>> {
  let body: ForgeAgentBody
  try {
    body = (await request.json()) as ForgeAgentBody
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 })
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    return NextResponse.json(
      { success: false, error: "GEMINI_API_KEY no configurada en el servidor" },
      { status: 503 },
    )
  }

  warnPhaserLiqSacMismatchOnce(TOKEN_ADDRESS, "forge-agent")

  const paymentRequirements = buildOfficialPaymentRequirements(request)
  const auth = request.headers.get("authorization")
  const paid = await paymentValid(request, auth, body, paymentRequirements)

  if (!paid) {
    return forgeAgentPaymentRequired(request, paymentRequirements)
  }

  if (typeof body.prompt !== "string") {
    return NextResponse.json({ success: false, error: "Falta prompt (string)" }, { status: 400 })
  }

  try {
    const payload = await runForgeAgentCore(body.prompt)
    return NextResponse.json(payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === "EMPTY_PROMPT") {
      return NextResponse.json({ success: false, error: "prompt vacío o inválido" }, { status: 400 })
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
