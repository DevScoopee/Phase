/**
 * Temporal: deriva claves públicas (G…) desde secrets en .env.local.
 * Uso (desde la raíz del repo):
 *   npx tsx scripts/check-keys.ts
 */
import * as StellarSdk from "@stellar/stellar-sdk"
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

/** Carga simple de .env (sin depender de dotenv en la raíz del monorepo). */
function loadEnvFile(absPath: string) {
  if (!fs.existsSync(absPath)) return
  for (const line of fs.readFileSync(absPath, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvFile(path.join(repoRoot, ".env.local"))
loadEnvFile(path.join(repoRoot, ".env"))

const issuerSecret = process.env.CLASSIC_LIQ_ISSUER_SECRET?.trim() ?? ""
const distributorSecret = process.env.FAUCET_DISTRIBUTOR_SECRET_KEY?.trim() ?? ""

if (!issuerSecret) {
  console.error("Falta CLASSIC_LIQ_ISSUER_SECRET en .env.local (raíz del repo).")
  process.exit(1)
}
if (!distributorSecret) {
  console.error("Falta FAUCET_DISTRIBUTOR_SECRET_KEY en .env.local (raíz del repo).")
  process.exit(1)
}

let issuerG: string
let distributorG: string
try {
  issuerG = StellarSdk.Keypair.fromSecret(issuerSecret).publicKey()
} catch {
  console.error("CLASSIC_LIQ_ISSUER_SECRET no es un secret Stellar válido.")
  process.exit(1)
}
try {
  distributorG = StellarSdk.Keypair.fromSecret(distributorSecret).publicKey()
} catch {
  console.error("FAUCET_DISTRIBUTOR_SECRET_KEY no es un secret Stellar válido.")
  process.exit(1)
}

console.log(`Issuer G: [${issuerG}]`)
console.log(`Distributor G: [${distributorG}]`)
