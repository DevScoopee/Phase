import { NextRequest, NextResponse } from "next/server"
import { Horizon, Networks, TransactionBuilder } from "@stellar/stellar-sdk"
import { HORIZON_URL } from "@/lib/phase-protocol"

export async function POST(req: NextRequest) {
  let body: { signedXdr?: string }
  try {
    body = (await req.json()) as { signedXdr?: string }
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
  }

  const signedXdr = body.signedXdr?.trim()
  if (!signedXdr) {
    return NextResponse.json({ error: "signedXdr es requerido." }, { status: 400 })
  }

  try {
    const server = new Horizon.Server(HORIZON_URL)
    const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET)
    const submit = await server.submitTransaction(tx)
    return NextResponse.json({ ok: true, hash: submit.hash })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
