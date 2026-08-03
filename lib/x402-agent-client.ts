/**
 * x402 agent payment client — server-only, zero browser APIs.
 *
 * Signs and submits the PHASELQ `settle` transaction autonomously using a
 * server-held Keypair. Intended for AI-agent workflows where no human wallet
 * or Freighter extension is available.
 */

import {
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  Address,
  TransactionBuilder,
  Transaction,
  FeeBumpTransaction,
} from "@stellar/stellar-sdk"
import {
  getPhaseProtocolAuthorizedTokenContractId,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  RPC_URL,
} from "@/lib/phase-protocol"
import { phaseProtocolContractIdForServer } from "@/lib/phase-protocol"

export interface X402Challenge {
  protocol: string
  network: string
  /** Amount in stroops (minimum token units). */
  amount: number
  /** PHASELQ SAC contract address (C…). */
  token: string
  facilitator: string
  invoice: string
}

/** Poll interval and maximum attempts for getTransaction confirmation. */
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_ATTEMPTS = 20
/** Soroban fee (stroops) used for agent-signed transactions. */
const AGENT_TX_FEE = "1000000"
/** Timeout in seconds for the agent-signed transaction. */
const AGENT_TX_TIMEOUT_SEC = 300

function newRpcServer(): rpc.Server {
  return new rpc.Server(RPC_URL)
}

async function loadAgentAccount(publicKey: string): Promise<import("@stellar/stellar-sdk").Account> {
  const res = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(publicKey)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
  if (res.status === 404) {
    throw new Error(
      `Agent account ${publicKey.slice(0, 6)}…${publicKey.slice(-4)} not found on Stellar testnet. ` +
        `Fund it with test XLM via Friendbot before using the agent endpoint.`,
    )
  }
  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 200)
    throw new Error(`Horizon account lookup failed (${res.status}): ${snippet}`)
  }
  const data = (await res.json()) as { sequence?: string }
  if (data.sequence == null || data.sequence === "") {
    throw new Error("Horizon response missing account sequence for agent account.")
  }
  const { Account } = await import("@stellar/stellar-sdk")
  return new Account(publicKey, data.sequence)
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Builds, signs, submits, and polls confirmation of a `settle` call on the
 * PHASE protocol contract, paying `challenge.amount` stroops of PHASELQ from
 * `agentKeypair` → protocol.
 *
 * Returns the confirmed transaction hash on success; throws on any failure.
 */
export async function settleX402Challenge(
  challenge: X402Challenge,
  agentKeypair: Keypair,
  payerAddress: string,
): Promise<{ txHash: string }> {
  const server = newRpcServer()
  const agentPublicKey = agentKeypair.publicKey()

  // Use payer address for the settle call; if caller passes undefined/empty, fall back to agent key.
  const payer = payerAddress?.trim() || agentPublicKey

  // Resolve the token contract that the protocol actually accepts on-chain.
  // Falls back to challenge.token if the RPC call fails.
  let liquidToken: string
  try {
    liquidToken = await getPhaseProtocolAuthorizedTokenContractId()
  } catch {
    liquidToken = challenge.token
  }

  const phaseProtocolContract = phaseProtocolContractIdForServer()
  const account = await loadAgentAccount(agentPublicKey)

  const invoiceId = parseInvoiceId(challenge.invoice)
  const amountBigInt = BigInt(Math.round(challenge.amount))

  const c = new Contract(phaseProtocolContract)
  const tx = new TransactionBuilder(account, {
    fee: AGENT_TX_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      c.call(
        "settle",
        Address.fromString(payer).toScVal(),
        Address.fromString(liquidToken).toScVal(),
        nativeToScVal(amountBigInt, { type: "i128" }),
        nativeToScVal(invoiceId, { type: "u32" }),
        nativeToScVal(0, { type: "u64" }),
      ),
    )
    .setTimeout(AGENT_TX_TIMEOUT_SEC)
    .build()

  // Simulate to get the correct resource fee + footprint.
  let prepared: Transaction
  try {
    const sim = await server.prepareTransaction(tx)
    prepared = sim instanceof FeeBumpTransaction ? sim.innerTransaction : (sim as Transaction)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`[x402-agent] prepareTransaction failed: ${msg}`)
  }

  // Sign server-side with the agent keypair — no browser / Freighter involved.
  prepared.sign(agentKeypair)
  const signedXdr = prepared.toEnvelope().toXDR("base64")

  // Submit.
  const parsedForSubmit = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET)
  const txForSubmit =
    parsedForSubmit instanceof FeeBumpTransaction
      ? parsedForSubmit.innerTransaction
      : (parsedForSubmit as Transaction)

  let sendResult: Awaited<ReturnType<typeof server.sendTransaction>>
  try {
    sendResult = await server.sendTransaction(txForSubmit)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`[x402-agent] sendTransaction RPC error: ${msg}`)
  }

  if (sendResult.status === "ERROR") {
    const raw = JSON.stringify(sendResult)
    if (/txTooLate/i.test(raw)) {
      throw new Error("[x402-agent] Transaction expired (txTooLate). Retry the request.")
    }
    throw new Error(`[x402-agent] sendTransaction rejected: ${raw.slice(0, 300)}`)
  }

  const txHash = sendResult.hash

  // Poll until confirmed.
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await sleepMs(POLL_INTERVAL_MS)
    let result: Awaited<ReturnType<typeof server.getTransaction>>
    try {
      result = await server.getTransaction(txHash)
    } catch {
      if (i === POLL_MAX_ATTEMPTS - 1) {
        throw new Error(`[x402-agent] getTransaction RPC error after ${POLL_MAX_ATTEMPTS} attempts.`)
      }
      continue
    }
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { txHash }
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`[x402-agent] Transaction ${txHash} failed on ledger.`)
    }
    // NOT_FOUND means still pending — keep polling.
  }

  throw new Error(`[x402-agent] Transaction ${txHash} not confirmed after ${POLL_MAX_ATTEMPTS} polls.`)
}

/**
 * Parses the `invoice` field from an X402Challenge into a u32 for the
 * `settle` contract call. Accepts numeric strings, `forge_<epoch>`, and
 * `inv_<epoch>` formats; falls back to 0 if unparseable.
 */
function parseInvoiceId(invoice: string): number {
  if (!invoice) return 0
  const stripped = invoice.replace(/^(forge_|inv_)/i, "")
  const n = parseInt(stripped, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  // Clamp to u32 range.
  return n >>> 0
}
