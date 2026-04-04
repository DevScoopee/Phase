import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
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
  stroopsToLiqDisplay,
  TOKEN_ADDRESS,
} from "@/lib/phase-protocol"

export const runtime = "nodejs"
export const maxDuration = 120

const X402_NETWORK = "stellar:testnet"
/** Coste forja-agente alineado con REQUIRED_AMOUNT (p. ej. 1.00 PHASERLIQ). */
const FORGE_PRICE_DISPLAY = `${stroopsToLiqDisplay(REQUIRED_AMOUNT)} PHASERLIQ`
/** Sufijo de estilo forzado para DALL·E (tras el prompt del usuario). */
const IMAGE_STYLE_SUFFIX =
  ", dark cyber-brutalist aesthetic, glowing neon cyan, minimalist glitch art, isometric"

type ForgeAgentBody = {
  prompt?: string
  /** Hash de tx Soroban exitosa que invoca `settle` en el contrato PHASE (PHASERLIQ). */
  settlementTxHash?: string
  /** Cuenta G que firmó la tx (debe coincidir con `source` del envelope). */
  payerAddress?: string
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

function buildLegacyChallenge(request: NextRequest) {
  const priceHuman = `${stroopsToLiqDisplay(REQUIRED_AMOUNT)} PHASERLIQ`
  return {
    protocol: "x402",
    version: "2",
    network: X402_NETWORK,
    token: CONTRACT_ID,
    contract_id: CONTRACT_ID,
    token_contract: TOKEN_ADDRESS,
    amount: parseRequiredAmountInt(),
    priceDisplay: priceHuman,
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
) {
  const challenge = buildLegacyChallenge(request)
  const challengeBase64 = Buffer.from(JSON.stringify(challenge)).toString("base64")
  const facilitator = facilitatorUrl(request)

  const body: Record<string, unknown> = {
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

async function verifyPhaseSettleTxOnChain(
  txHash: string,
  payerAddress: string,
): Promise<boolean> {
  const payer = payerAddress.trim()
  if (!payer.startsWith("G") || payer.length !== 56) return false

  const server = new rpc.Server(RPC_URL)
  const res = await server.getTransaction(txHash.trim())
  if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS) return false

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
    } catch {
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
    } catch {
      return false
    }
  }

  if (!authHeader?.toLowerCase().startsWith("x402 ")) return false
  const raw = authHeader.slice(5).trim()
  if (!raw) return false

  if (!paymentRequirements) return false

  try {
    return await verifyOfficialX402(raw, paymentRequirements)
  } catch {
    return false
  }
}

type ForgeAgentSuccess = {
  success: true
  imageUrl: string
  lore: string
  metadataStandard: "SEP-20"
}

async function runForgeAgentCore(prompt: string): Promise<ForgeAgentSuccess> {
  const apiKey = process.env.OPENAI_API_KEY!.trim()
  const openai = new OpenAI({ apiKey })
  const trimmed = prompt.trim()
  if (!trimmed) {
    throw new Error("EMPTY_PROMPT")
  }

  const imagePrompt = `${trimmed}${IMAGE_STYLE_SUFFIX}`

  const imageModel = process.env.OPENAI_FORGE_IMAGE_MODEL?.trim() || "dall-e-3"

  const imageResult = await openai.images.generate({
    model: imageModel,
    prompt: imagePrompt,
    n: 1,
    size: "1024x1024",
  })

  const imageUrl = imageResult.data?.[0]?.url
  if (!imageUrl) {
    throw new Error("OpenAI images.generate returned no URL")
  }

  const loreModel = process.env.OPENAI_FORGE_LORE_MODEL?.trim() || "gpt-4o-mini"

  const completion = await openai.chat.completions.create({
    model: loreModel,
    messages: [
      {
        role: "system",
        content:
          "Eres el Arquitecto del Protocolo PHASE. Escribe una descripción de máximo 2 oraciones técnicas, oscuras y enigmáticas sobre el siguiente artefacto (el usuario describe la anomalía a continuación). Sin títulos ni comillas. Texto apto para metadata SEP-20.",
      },
      {
        role: "user",
        content: trimmed,
      },
    ],
    max_tokens: 220,
    temperature: 0.85,
  })

  const lore = completion.choices[0]?.message?.content?.trim() || ""

  return {
    success: true,
    imageUrl,
    lore,
    metadataStandard: "SEP-20",
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { success: false, error: "OPENAI_API_KEY no configurada en el servidor" },
      { status: 503 },
    )
  }

  let body: ForgeAgentBody
  try {
    body = (await request.json()) as ForgeAgentBody
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const paymentRequirements = buildOfficialPaymentRequirements(request)
  const auth = request.headers.get("authorization")
  const paid = await paymentValid(request, auth, body, paymentRequirements)

  if (!paid) {
    return forgeAgentPaymentRequired(request, paymentRequirements)
  }

  if (typeof body.prompt !== "string") {
    return NextResponse.json({ error: "Falta prompt (string)" }, { status: 400 })
  }

  try {
    const payload = await runForgeAgentCore(body.prompt)
    return NextResponse.json(payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === "EMPTY_PROMPT") {
      return NextResponse.json({ success: false, error: "prompt vacío o inválido" }, { status: 400 })
    }
    console.error(
      "[forge-agent] PAID_RUN_OPENAI_FAIL — x402/settle was already accepted; no automatic refund (log only).",
      e,
    )
    return NextResponse.json(
      {
        success: false,
        error: "Fallo del agente IA (OpenAI). El pago ya fue aceptado; revisar logs.",
        detail: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    )
  }
}
