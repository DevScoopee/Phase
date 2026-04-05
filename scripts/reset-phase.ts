/**
 * Reset de identidades testnet para PHASERLIQ clásico + distribuidor con liquidez.
 *
 * Crea issuer + distributor, fondea con Friendbot, trustline, pago masivo al distribuidor.
 * Imprime variables para `.env.local` y el comando Stellar CLI para desplegar el SAC.
 *
 * Uso (desde la raíz del repo):
 *   cd scripts && npm install && npm run reset:phase
 *
 * O desde la raíz:
 *   npm run reset:phase
 *
 * Después, despliega el Stellar Asset Contract (SAC) en testnet:
 *   stellar contract asset deploy --asset PHASERLIQ:<ISSUER_G> --network testnet
 * Copia el Contract ID (C…) a:
 *   NEXT_PUBLIC_TOKEN_CONTRACT_ID
 *   NEXT_PUBLIC_PHASER_TOKEN_ID
 *
 * Opcional: publicar home_domain para stellar.toml / Stellar Expert:
 *   cd scripts && CLASSIC_LIQ_ISSUER_SECRET=<issuer secret> npm run set:issuer-home-domain
 */
import * as dotenv from "dotenv"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(repoRoot, ".env.local") })
dotenv.config({ path: path.join(repoRoot, ".env") })
dotenv.config({ path: path.join(__dirname, ".env") })

const HORIZON_URL = process.env.HORIZON_TESTNET_URL?.trim() || "https://horizon-testnet.stellar.org"
const NETWORK_PASSPHRASE = Networks.TESTNET
/** Override: `RESET_PHASE_ASSET_CODE=PHASELQ` si tu app usa ese código en testnet. */
const ASSET_CODE = process.env.RESET_PHASE_ASSET_CODE?.trim() || "PHASERLIQ"
/** Cantidad enviada al distribuidor (formato Stellar, 7 decimales). */
const INITIAL_DISTRIBUTOR_AMOUNT = process.env.RESET_PHASE_MINT_AMOUNT?.trim() || "1000000.0000000"

const server = new Horizon.Server(HORIZON_URL)

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`
  const res = await fetch(url)
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Friendbot falló (${res.status}): ${t.slice(0, 240)}`)
  }
}

async function waitForAccount(publicKey: string, label: string): Promise<void> {
  const maxAttempts = 20
  const delayMs = 1500
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await server.loadAccount(publicKey)
      return
    } catch {
      if (i === maxAttempts - 1) {
        throw new Error(`Timeout esperando cuenta ${label} (${publicKey.slice(0, 8)}…) en Horizon.`)
      }
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}

async function main() {
  console.log("INICIANDO RESET DE PROTOCOLO PHASE (testnet clásico + distribuidor)\n")

  const issuer = Keypair.random()
  const distributor = Keypair.random()

  console.log("ISSUER (emisor del asset PHASERLIQ)")
  console.log(`  Public:  ${issuer.publicKey()}`)
  console.log(`  Secret:  ${issuer.secret()}`)
  console.log("")
  console.log("DISTRIBUTOR (faucet / transfer mode)")
  console.log(`  Public:  ${distributor.publicKey()}`)
  console.log(`  Secret:  ${distributor.secret()}`)
  console.log("")

  console.log("Friendbot: fondeando XLM…")
  await fundWithFriendbot(issuer.publicKey())
  await new Promise((r) => setTimeout(r, 1200))
  await fundWithFriendbot(distributor.publicKey())

  console.log("Esperando que Horizon indexe las cuentas…")
  await waitForAccount(issuer.publicKey(), "issuer")
  await waitForAccount(distributor.publicKey(), "distributor")

  const phaserLiq = new Asset(ASSET_CODE, issuer.publicKey())

  console.log("Creando trustline del distribuidor hacia PHASERLIQ…")
  const accountDist = await server.loadAccount(distributor.publicKey())
  const txTrust = new TransactionBuilder(accountDist, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset: phaserLiq,
      }),
    )
    .setTimeout(180)
    .build()
  txTrust.sign(distributor)
  const trustRes = await server.submitTransaction(txTrust)
  console.log(`  OK — trustline. Hash: ${trustRes.hash}`)

  console.log(`Emitiendo ${INITIAL_DISTRIBUTOR_AMOUNT} ${ASSET_CODE} al distribuidor…`)
  const accountIssuer = await server.loadAccount(issuer.publicKey())
  const txMint = new TransactionBuilder(accountIssuer, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: distributor.publicKey(),
        asset: phaserLiq,
        amount: INITIAL_DISTRIBUTOR_AMOUNT,
      }),
    )
    .setTimeout(180)
    .build()
  txMint.sign(issuer)
  const mintRes = await server.submitTransaction(txMint)
  console.log(`  OK — payment. Hash: ${mintRes.hash}`)

  console.log("\n--- Copia en .env.local (raíz del repo) ---\n")
  console.log(`NEXT_PUBLIC_CLASSIC_LIQ_ASSET_CODE="${ASSET_CODE}"`)
  console.log(`NEXT_PUBLIC_CLASSIC_LIQ_ISSUER="${issuer.publicKey()}"`)
  console.log(`CLASSIC_LIQ_ISSUER_SECRET="${issuer.secret()}"`)
  console.log(`FAUCET_DISTRIBUTOR_SECRET_KEY="${distributor.secret()}"`)
  console.log("")
  console.log("Luego despliega el SAC y añade el Contract ID (C…), por ejemplo:")
  console.log("")
  console.log(
    `  stellar contract asset deploy --asset ${ASSET_CODE}:${issuer.publicKey()} --network testnet`,
  )
  console.log("")
  console.log("Pega el C… en:")
  console.log('  NEXT_PUBLIC_TOKEN_CONTRACT_ID="C…"')
  console.log('  NEXT_PUBLIC_PHASER_TOKEN_ID="C…"')
  console.log("")
  console.log("Si el contrato PHASE ya está inicializado con otro token, hay que volver a llamar")
  console.log("`initialize` en el WASM con este nuevo SAC, o redeploy + init alineado.")
  console.log("")
  console.log("Guarda estos secrets en un gestor seguro; no los subas a git.")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
