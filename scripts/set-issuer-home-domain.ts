/**
 * Publica `home_domain` en la cuenta emisora del asset clásico PHASERLIQ (Horizon testnet).
 * Así Freighter / wallets resuelven https://TU_DOMINIO/.well-known/stellar.toml y el icono.
 *
 * Requiere CLASSIC_LIQ_ISSUER_SECRET (misma que POST /api/classic-liq bootstrap).
 *
 * Uso desde la raíz del repo:
 *   cd scripts && npm install && npm run set:issuer-home-domain
 *
 * Variables:
 *   CLASSIC_LIQ_ISSUER_HOME_DOMAIN  — opcional; host sin protocolo (ej. www.phasee.xyz)
 *   NEXT_PUBLIC_SITE_URL          — si no hay la anterior, se usa el host de esta URL
 */
import * as dotenv from "dotenv"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(repoRoot, ".env.local") })
dotenv.config({ path: path.join(repoRoot, ".env") })
dotenv.config({ path: path.join(__dirname, ".env") })

const HORIZON_URL = process.env.HORIZON_TESTNET_URL?.trim() || "https://horizon-testnet.stellar.org"

function parseHomeDomainFromEnv(): string {
  const explicit = process.env.CLASSIC_LIQ_ISSUER_HOME_DOMAIN?.trim()
  if (explicit) return stripUrlToHost(explicit)
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (site) return stripUrlToHost(site)
  return "www.phasee.xyz"
}

function stripUrlToHost(raw: string): string {
  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .trim()
    .toLowerCase()
}

async function main() {
  const secret = process.env.CLASSIC_LIQ_ISSUER_SECRET?.trim()
  if (!secret || secret.length < 20) {
    console.error(
      "Falta CLASSIC_LIQ_ISSUER_SECRET en .env.local (raíz del repo). Sin la clave del emisor no se puede firmar set_options.",
    )
    process.exit(1)
  }

  const homeDomain = parseHomeDomainFromEnv()
  if (!homeDomain || homeDomain.length > 32) {
    console.error("home_domain inválido o > 32 caracteres (límite Stellar).")
    process.exit(1)
  }

  let kp: Keypair
  try {
    kp = Keypair.fromSecret(secret)
  } catch {
    console.error("CLASSIC_LIQ_ISSUER_SECRET no es un secret Stellar válido.")
    process.exit(1)
  }

  const server = new Horizon.Server(HORIZON_URL)
  const pub = kp.publicKey()
  const account = await server.loadAccount(pub)
  const current = (account.home_domain ?? "").trim()
  if (current === homeDomain) {
    console.log(`home_domain ya es "${homeDomain}" en ${pub}. Nada que hacer.`)
    return
  }
  if (current) {
    console.log(`Cambiando home_domain: "${current}" → "${homeDomain}"`)
  } else {
    console.log(`Estableciendo home_domain="${homeDomain}" en emisor ${pub}`)
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.setOptions({
        homeDomain,
      }),
    )
    .setTimeout(180)
    .build()
  tx.sign(kp)

  const res = await server.submitTransaction(tx)
  console.log("OK. Hash:", res.hash)
  console.log(`Horizon: ${HORIZON_URL.replace(/\/$/, "")}/transactions/${res.hash}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
