import { NextRequest, NextResponse } from "next/server"
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk"
import { classicLiqIssuerForStellarToml } from "@/lib/classic-liq"
import {
  buildTransferPhaseNftTransaction,
  fetchTokenOwnerAddress,
  getTransactionResult,
  NETWORK_PASSPHRASE,
  phaseProtocolContractIdForServer,
  sendTransaction,
} from "@/lib/phase-protocol"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PHASE_PROTOCOL_CONTRACT = phaseProtocolContractIdForServer()

type Body = {
  tokenId?: number | string
  recipientWallet?: string
}

/**
 * Transfiere el NFT PHASE desde la cuenta custodia (emisor PHASELQ G…) al usuario.
 * El contrato exige `from.require_auth()`: solo puede firmar el custodio on-chain.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 })
  }

  const rawId = body.tokenId
  const tokenId = typeof rawId === "number" ? rawId : Number.parseInt(String(rawId ?? ""), 10)
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid tokenId." }, { status: 400 })
  }

  const recipient = typeof body.recipientWallet === "string" ? body.recipientWallet.trim() : ""
  if (!recipient || !recipient.startsWith("G") || recipient.length !== 56) {
    return NextResponse.json({ ok: false, error: "Invalid recipientWallet." }, { status: 400 })
  }

  const secret = process.env.CLASSIC_LIQ_ISSUER_SECRET?.trim()
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        code: "MISSING_ISSUER_SECRET",
        error: "CLASSIC_LIQ_ISSUER_SECRET is not configured; server cannot sign custodian transfer.",
      },
      { status: 503 },
    )
  }

  let kp: Keypair
  try {
    kp = Keypair.fromSecret(secret)
  } catch {
    return NextResponse.json({ ok: false, error: "CLASSIC_LIQ_ISSUER_SECRET is not a valid Stellar secret." }, { status: 503 })
  }

  const issuerG = classicLiqIssuerForStellarToml()
  if (kp.publicKey().toUpperCase() !== issuerG.toUpperCase()) {
    return NextResponse.json(
      {
        ok: false,
        code: "ISSUER_SECRET_MISMATCH",
        error: "CLASSIC_LIQ_ISSUER_SECRET public key does not match configured PHASELQ issuer (classicLiqIssuerForStellarToml).",
      },
      { status: 503 },
    )
  }

  const owner = await fetchTokenOwnerAddress(PHASE_PROTOCOL_CONTRACT, Math.floor(tokenId))
  if (!owner) {
    return NextResponse.json(
      { ok: false, code: "NFT_NOT_MINTED", error: "No on-chain owner for this token id." },
      { status: 404 },
    )
  }

  if (owner.toUpperCase() !== issuerG.toUpperCase()) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_ISSUER_CUSTODY",
        owner,
        detail:
          "This token is not held by the configured PHASELQ issuer. It may already be in the user's wallet or held by another address.",
      },
      { status: 409 },
    )
  }

  if (recipient.toUpperCase() === owner.toUpperCase()) {
    return NextResponse.json({ ok: false, error: "Recipient is already the on-chain owner." }, { status: 400 })
  }

  try {
    const xdr = await buildTransferPhaseNftTransaction(issuerG, recipient, Math.floor(tokenId))
    const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE)
    tx.sign(kp)
    const sendResult = await sendTransaction(tx.toXDR())
    const hash = sendResult.hash as string | undefined
    if (hash) {
      await getTransactionResult(hash)
    }
    return NextResponse.json({ ok: true, hash: hash ?? null, contractId: PHASE_PROTOCOL_CONTRACT, tokenId: Math.floor(tokenId) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
