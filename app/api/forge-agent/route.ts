import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { warnPhaserLiqSacMismatchOnce } from "@/lib/phaser-liq-sac-warn"
import { forgeGoogleAiApiKey } from "@/lib/forge/ai-pipeline"
import { buildOfficialPaymentRequirements, verifyPaymentStep, extractSettlementReceiptTxHash, buildLegacyChallenge, forgePriceDisplay, X402_NETWORK } from "@/lib/forge/payment-verifier"
import { runForgePipeline } from "@/lib/forge/pipeline"
import { tokenContractIdForServer, REQUIRED_AMOUNT } from "@/lib/phase-protocol"

export const runtime = "nodejs"
export const maxDuration = 120
export const dynamic = "force-dynamic"

const PHASE_LIQ_TOKEN_CONTRACT = tokenContractIdForServer()
const ERR_SETTLEMENT_REJECTED = "[ ERROR: SETTLEMENT_REJECTED_BY_FACILITATOR ]"

function paymentRequiredResponse(request: NextRequest) {
  const origin = request.nextUrl.origin
  const challenge = buildLegacyChallenge(origin, request.nextUrl.pathname)
  const paymentRequirements = buildOfficialPaymentRequirements(origin)
  const b64 = Buffer.from(JSON.stringify(challenge)).toString("base64")
  const body: Record<string, unknown> = {
    success: false, error: "Payment Required", priceDisplay: forgePriceDisplay(),
    message: "Se requiere pago en PHASELQ. Tras confirmar on-chain, reintenta con Authorization o settlementTxHash.",
    challenge,
  }
  if (paymentRequirements) body.paymentRequirements = paymentRequirements
  return NextResponse.json(body, {
    status: 402,
    headers: {
      "WWW-Authenticate": `x402 token="${b64}", amount="${challenge.amount}", facilitator="${challenge.facilitator}", network="${X402_NETWORK}"`,
      "X-Required-Amount": REQUIRED_AMOUNT, "X-Token-Address": PHASE_LIQ_TOKEN_CONTRACT,
      "X-Facilitator": challenge.facilitator, "X-X402-Network": X402_NETWORK,
    },
  })
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id")?.trim() || randomUUID()
  let body: { prompt?: string; settlementTxHash?: string; payerAddress?: string; imageStyleMode?: string; collection_id?: number; lang?: string }
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400, headers: { "x-correlation-id": correlationId } }) }

  if (!forgeGoogleAiApiKey()) {
    return NextResponse.json({ success: false, error: "GOOGLE_AI_STUDIO_API_KEY (o GEMINI_API_KEY) no configurada." }, { status: 503, headers: { "x-correlation-id": correlationId } })
  }
  warnPhaserLiqSacMismatchOnce(PHASE_LIQ_TOKEN_CONTRACT, "forge-agent")

  const paymentRequirements = buildOfficialPaymentRequirements(request.nextUrl.origin)
  const auth = request.headers.get("authorization")
  const receipt = extractSettlementReceiptTxHash(auth, body)

  if (receipt) {
    // demo path: trusted receipt skips on-chain re-verify (preserve existing behavior)
  } else {
    const resolution = await verifyPaymentStep({ authHeader: auth, body, paymentRequirements })
    if (resolution === "facilitator_rejected") return NextResponse.json({ success: false, error: ERR_SETTLEMENT_REJECTED }, { status: 403, headers: { "x-correlation-id": correlationId } })
    if (resolution === "missing") return paymentRequiredResponse(request)
  }

  if (typeof body.prompt !== "string") {
    return NextResponse.json({ success: false, error: "Falta prompt (string)" }, { status: 400, headers: { "x-correlation-id": correlationId } })
  }

  try {
    const result = await runForgePipeline(body, correlationId)
    return NextResponse.json(result, { headers: { "x-correlation-id": correlationId } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === "EMPTY_PROMPT") return NextResponse.json({ success: false, error: "prompt vacío o inválido" }, { status: 400, headers: { "x-correlation-id": correlationId } })
    if (msg === "MISSING_GOOGLE_AI_KEY") return NextResponse.json({ success: false, error: "GOOGLE_AI_STUDIO_API_KEY no configurada." }, { status: 503, headers: { "x-correlation-id": correlationId } })
    if (msg === "NANO_BANANA_CORE_OVERLOAD") return NextResponse.json({ success: false, error: "[ ERROR: NANO_BANANA_CORE_OVERLOAD ]" }, { status: 503, headers: { "x-correlation-id": correlationId } })
    if (msg.startsWith("GEMINI_")) return NextResponse.json({ success: false, error: "Fallo al generar lore con Gemini.", detail: process.env.NODE_ENV === "development" ? msg : undefined }, { status: 500, headers: { "x-correlation-id": correlationId } })
    return NextResponse.json({ success: false, error: "Fallo del agente IA (Gemini).", detail: process.env.NODE_ENV === "development" ? msg : undefined }, { status: 500, headers: { "x-correlation-id": correlationId } })
  }
}
