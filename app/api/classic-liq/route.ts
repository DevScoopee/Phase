import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { serverDataJsonPath } from "@/lib/server-data-paths"
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk"
import {
  readClassicWalletStatus,
  type ClassicLiqAsset,
  type ClassicLiqWalletStatus,
} from "@/lib/classic-liq"
import { HORIZON_URL } from "@/lib/phase-protocol"

type ClassicClaims = Record<string, { classicFundAt?: number }>

function classicClaimsFilePath() {
  return serverDataJsonPath("classicLiqClaims")
}

async function readClassicClaims(): Promise<ClassicClaims> {
  try {
    const raw = await readFile(classicClaimsFilePath(), "utf8")
    const parsed = JSON.parse(raw) as ClassicClaims
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function writeClassicClaims(claims: ClassicClaims) {
  const file = classicClaimsFilePath()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(claims, null, 2), "utf8")
}

function readClassicAssetConfig(): { asset: ClassicLiqAsset; issuerKp: Keypair; amount: string } | null {
  const code = process.env.CLASSIC_LIQ_ASSET_CODE?.trim() || process.env.NEXT_PUBLIC_CLASSIC_LIQ_ASSET_CODE?.trim() || ""
  const issuerSecret = process.env.CLASSIC_LIQ_ISSUER_SECRET?.trim() || ""
  const amount = process.env.CLASSIC_LIQ_BOOTSTRAP_AMOUNT?.trim() || "10.0000000"
  if (!code || !issuerSecret) return null
  let issuerKp: Keypair
  try {
    issuerKp = Keypair.fromSecret(issuerSecret)
  } catch {
    return null
  }
  return { asset: { code, issuer: issuerKp.publicKey() }, issuerKp, amount }
}

async function walletStatus(wallet: string, asset: ClassicLiqAsset): Promise<ClassicLiqWalletStatus> {
  return readClassicWalletStatus(wallet, asset)
}

async function markClassicFund(wallet: string) {
  const claims = await readClassicClaims()
  const row = claims[wallet] ?? {}
  row.classicFundAt = Date.now()
  claims[wallet] = row
  await writeClassicClaims(claims)
}

export async function GET(req: NextRequest) {
  const config = readClassicAssetConfig()
  const wallet = req.nextUrl.searchParams.get("walletAddress")?.trim() ?? null
  if (!config) {
    return NextResponse.json({ enabled: false })
  }
  if (!wallet) {
    return NextResponse.json({
      enabled: true,
      asset: config.asset,
      bootstrapAmount: config.amount,
    })
  }
  if (!StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "walletAddress inválida." }, { status: 400 })
  }
  try {
    const status = await walletStatus(wallet, config.asset)
    const claims = await readClassicClaims()
    const fundedAt = claims[wallet]?.classicFundAt ?? null
    return NextResponse.json({
      enabled: true,
      asset: config.asset,
      bootstrapAmount: config.amount,
      wallet,
      status,
      fundedAt,
      claimable: status.hasTrustline && !fundedAt,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), enabled: true, asset: config.asset },
      { status: 502 },
    )
  }
}

export async function POST(req: NextRequest) {
  const config = readClassicAssetConfig()
  if (!config) {
    return NextResponse.json(
      { error: "Classic LIQ disabled. Set CLASSIC_LIQ_ASSET_CODE + CLASSIC_LIQ_ISSUER_SECRET." },
      { status: 503 },
    )
  }

  let body: { walletAddress?: string; userAddress?: string }
  try {
    body = (await req.json()) as { walletAddress?: string; userAddress?: string }
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
  }

  const wallet = (body.walletAddress ?? body.userAddress)?.trim()
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "walletAddress debe ser cuenta Stellar G válida." }, { status: 400 })
  }

  const status = await walletStatus(wallet, config.asset)
  if (!status.accountExists) {
    return NextResponse.json(
      { error: "Wallet account not found on testnet. Fund account with Friendbot first." },
      { status: 412 },
    )
  }
  if (!status.hasTrustline) {
    return NextResponse.json(
      {
        error: "Trustline required. User must sign changeTrust in Freighter first.",
        asset: config.asset,
      },
      { status: 412 },
    )
  }

  const claims = await readClassicClaims()
  const fundedAt = claims[wallet]?.classicFundAt ?? null
  if (fundedAt) {
    return NextResponse.json(
      {
        error: "Classic bootstrap already claimed for this wallet.",
        fundedAt,
      },
      { status: 409 },
    )
  }

  try {
    const server = new Horizon.Server(HORIZON_URL)
    const source = await server.loadAccount(config.issuerKp.publicKey())
    const asset = new Asset(config.asset.code, config.asset.issuer)
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: wallet,
          asset,
          amount: config.amount,
        }),
      )
      .setTimeout(30)
      .build()
    tx.sign(config.issuerKp)
    const submit = await server.submitTransaction(tx)
    await markClassicFund(wallet)
    return NextResponse.json({
      ok: true,
      hash: submit.hash,
      asset: config.asset,
      amount: config.amount,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), asset: config.asset },
      { status: 502 },
    )
  }
}
