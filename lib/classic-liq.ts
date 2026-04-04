import {
  Account,
  Asset,
  BASE_FEE,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk"
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
  balances?: HorizonBalance[]
}

export function classicLiqAssetConfigFromPublicEnv(): ClassicLiqAsset | null {
  const code = process.env.NEXT_PUBLIC_CLASSIC_LIQ_ASSET_CODE?.trim() ?? ""
  const issuer = process.env.NEXT_PUBLIC_CLASSIC_LIQ_ISSUER?.trim() ?? ""
  if (!code || !issuer) return null
  if (!StrKey.isValidEd25519PublicKey(issuer)) return null
  return { code, issuer }
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
  if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
    throw new Error("Invalid wallet address.")
  }
  const sequenceRes = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(walletAddress)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
  if (sequenceRes.status === 404) {
    throw new Error("Account not found on testnet. Fund with test XLM first.")
  }
  if (!sequenceRes.ok) {
    throw new Error(`Could not read sequence (${sequenceRes.status}).`)
  }
  const accountJson = (await sequenceRes.json()) as { sequence?: string }
  const sequence = accountJson.sequence?.trim()
  if (!sequence) throw new Error("Missing account sequence.")

  const source = new Account(walletAddress, sequence)
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

export function parseSignedTxXdr(result: unknown): string | null {
  if (!result || typeof result !== "object") return null
  const r = result as { signedTxXdr?: string; signedTransaction?: string }
  return r.signedTxXdr || r.signedTransaction || null
}
