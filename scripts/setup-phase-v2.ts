/**
 * Emergency bootstrap: recrea Issuer + Distributor y deja PHASERLIQ operativo en testnet.
 *
 * Flujo:
 * 1) Genera dos keypairs nuevos (Issuer, Distributor)
 * 2) Fondea ambos con Friendbot
 * 3) Crea trustline del Distributor al asset clásico PHASERLIQ
 * 4) Envía payment Issuer -> Distributor (supply inicial)
 * 5) Ejecuta `stellar contract asset deploy` para ese asset y captura Contract ID
 * 6) Imprime bloque listo para pegar en .env.local
 *
 * Uso:
 *   cd scripts && npm install && npm run setup:phase-v2
 *
 * Opcional:
 *   PHASE_V2_ASSET_CODE=PHASERLIQ
 *   PHASE_V2_INITIAL_DISTRIBUTION=100000.0000000
 *   PHASE_V2_RPC_URL=https://soroban-testnet.stellar.org
 *   PHASE_V2_HORIZON_URL=https://horizon-testnet.stellar.org
 */

import * as dotenv from "dotenv"
import { execFileSync } from "node:child_process"
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

dotenv.config()

const RPC_URL = process.env.PHASE_V2_RPC_URL?.trim() || "https://soroban-testnet.stellar.org"
const HORIZON_URL = process.env.PHASE_V2_HORIZON_URL?.trim() || "https://horizon-testnet.stellar.org"
const NETWORK_PASSPHRASE = Networks.TESTNET
const FRIENDBOT_URL = "https://friendbot.stellar.org"
const ASSET_CODE = process.env.PHASE_V2_ASSET_CODE?.trim() || "PHASERLIQ"
const INITIAL_DISTRIBUTION = process.env.PHASE_V2_INITIAL_DISTRIBUTION?.trim() || "100000.0000000"
const MAX_TRUST = "922337203685.4775807"

function ensureValidClassicAssetCode(code: string): void {
  if (code.length < 1 || code.length > 12 || !/^[a-zA-Z0-9]+$/.test(code)) {
    throw new Error(`Código de asset inválido: "${code}". Debe ser alfanumérico (1-12), sin "_"`)
  }
}

function ensureValidClassicAmount(value: string): void {
  if (!/^\d+(\.\d{1,7})?$/.test(value)) {
    throw new Error(`Monto inválido: "${value}". Usa formato clásico con hasta 7 decimales.`)
  }
}

async function friendbotFund(publicKey: string): Promise<void> {
  const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`
  const res = await fetch(url)
  const txt = await res.text()
  if (!res.ok) {
    throw new Error(`Friendbot ${res.status}: ${txt.slice(0, 300)}`)
  }
}

async function waitForAccount(server: Horizon.Server, publicKey: string): Promise<void> {
  for (let i = 0; i < 25; i++) {
    try {
      await server.loadAccount(publicKey)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 1200))
    }
  }
  throw new Error(`Timeout esperando cuenta en Horizon: ${publicKey}`)
}

async function submit(
  server: Horizon.Server,
  signer: Keypair,
  ops: Array<ReturnType<typeof Operation.changeTrust> | ReturnType<typeof Operation.payment>>,
): Promise<{ hash: string }> {
  const sourceAccount = await server.loadAccount(signer.publicKey())
  let builder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
  for (const op of ops) builder = builder.addOperation(op)
  const tx = builder.setTimeout(180).build()
  tx.sign(signer)
  return server.submitTransaction(tx)
}

function parseContractIdFromDeployOutput(output: string): string | null {
  const all = output.match(/C[A-Z2-7]{55}/g)
  if (!all || all.length === 0) return null
  return all[all.length - 1] ?? null
}

function deploySACViaCli(assetDescriptor: string, sourceSecret: string): string {
  const args = [
    "contract",
    "asset",
    "deploy",
    "--network",
    "testnet",
    "--rpc-url",
    RPC_URL,
    "--network-passphrase",
    NETWORK_PASSPHRASE,
    "--asset",
    assetDescriptor,
    "--source-account",
    sourceSecret,
  ]

  let stdout = ""
  try {
    stdout = execFileSync("stellar", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    const merged = `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? ""}`
    const maybeExisting =
      merged.includes("Error(Storage, ExistingValue)") || /contract already exists/i.test(merged)
    if (maybeExisting) {
      // El SAC ya existe para ese code:issuer. Derivamos el ID determinístico.
      const [code, issuer] = assetDescriptor.split(":")
      if (!issuer || !StrKey.isValidEd25519PublicKey(issuer)) {
        throw new Error(`No pude derivar contract id tras ExistingValue. Salida CLI:\n${merged}`)
      }
      return new Asset(code, issuer).contractId(NETWORK_PASSPHRASE)
    }
    throw new Error(`stellar contract asset deploy falló:\n${merged}`)
  }

  const parsed = parseContractIdFromDeployOutput(stdout)
  if (parsed) return parsed

  const [code, issuer] = assetDescriptor.split(":")
  if (!issuer || !StrKey.isValidEd25519PublicKey(issuer)) {
    throw new Error(`No pude extraer Contract ID del output CLI:\n${stdout}`)
  }
  return new Asset(code, issuer).contractId(NETWORK_PASSPHRASE)
}

function printEnvBlock(params: {
  issuerPublic: string
  issuerSecret: string
  distributorPublic: string
  distributorSecret: string
  assetCode: string
  tokenContractId: string
}): void {
  const lines = [
    "",
    "######################### .env.local (PHASE v2 emergency) #########################",
    `NEXT_PUBLIC_CLASSIC_LIQ_ASSET_CODE=${params.assetCode}`,
    `NEXT_PUBLIC_CLASSIC_LIQ_ISSUER=${params.issuerPublic}`,
    `CLASSIC_LIQ_ASSET_CODE=${params.assetCode}`,
    `CLASSIC_LIQ_ISSUER_SECRET=${params.issuerSecret}`,
    `CLASSIC_LIQ_DISTRIBUTOR_PUBLIC=${params.distributorPublic}`,
    `FAUCET_DISTRIBUTOR_SECRET_KEY=${params.distributorSecret}`,
    "",
    `NEXT_PUBLIC_TOKEN_CONTRACT_ID=${params.tokenContractId}`,
    `TOKEN_CONTRACT_ID=${params.tokenContractId}`,
    `NEXT_PUBLIC_PHASER_TOKEN_ID=${params.tokenContractId}`,
    "####################### fin bloque PHASE v2 emergency #############################",
    "",
  ]
  console.log(lines.join("\n"))
}

async function main() {
  console.log("\n=== PHASE emergency setup v2 (testnet) ===\n")
  ensureValidClassicAssetCode(ASSET_CODE)
  ensureValidClassicAmount(INITIAL_DISTRIBUTION)

  const server = new Horizon.Server(HORIZON_URL)
  const issuer = Keypair.random()
  const distributor = Keypair.random()

  console.log("Nuevas llaves:")
  console.log(`ISSUER_PUBLIC_KEY=${issuer.publicKey()}`)
  console.log(`ISSUER_SECRET_KEY=${issuer.secret()}`)
  console.log(`DISTRIBUTOR_PUBLIC_KEY=${distributor.publicKey()}`)
  console.log(`DISTRIBUTOR_SECRET_KEY=${distributor.secret()}`)

  console.log("\n1) Fondeando con Friendbot...")
  await friendbotFund(issuer.publicKey())
  await friendbotFund(distributor.publicKey())
  await waitForAccount(server, issuer.publicKey())
  await waitForAccount(server, distributor.publicKey())
  console.log("   OK: ambas cuentas ya existen en Horizon.")

  const asset = new Asset(ASSET_CODE, issuer.publicKey())

  console.log("\n2) Creando trustline en distributor...")
  const trust = await submit(server, distributor, [Operation.changeTrust({ asset, limit: MAX_TRUST })])
  console.log(`   trustline tx: ${trust.hash}`)

  console.log(`\n3) Payment Issuer -> Distributor (${INITIAL_DISTRIBUTION} ${ASSET_CODE})...`)
  const pay = await submit(server, issuer, [
    Operation.payment({
      destination: distributor.publicKey(),
      asset,
      amount: INITIAL_DISTRIBUTION,
    }),
  ])
  console.log(`   payment tx: ${pay.hash}`)

  const assetDescriptor = `${ASSET_CODE}:${issuer.publicKey()}`
  console.log(`\n4) Deploy SAC via Stellar CLI (${assetDescriptor})...`)
  const contractId = deploySACViaCli(assetDescriptor, distributor.secret())
  console.log(`   Contract ID: ${contractId}`)

  console.log("\n5) Bloque .env.local listo para pegar:")
  printEnvBlock({
    issuerPublic: issuer.publicKey(),
    issuerSecret: issuer.secret(),
    distributorPublic: distributor.publicKey(),
    distributorSecret: distributor.secret(),
    assetCode: ASSET_CODE,
    tokenContractId: contractId,
  })

  console.log("Done.")
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e)
  console.error(`\nERROR: ${msg}`)
  process.exit(1)
})
