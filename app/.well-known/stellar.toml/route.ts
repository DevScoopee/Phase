import { NextResponse } from "next/server"
import { classicLiqCodeForStellarToml, classicLiqIssuerForStellarToml } from "@/lib/classic-liq"
import { TOKEN_ADDRESS, stellarExpertPhaserLiqUrl } from "@/lib/phase-protocol"

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
const PRODUCTION_SITE = "https://www.phasee.xyz"

/** Base URL for absolute `image=` in stellar.toml (wallets require HTTPS + absolute). */
function siteBaseForStellarToml(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/+$/, "")
  if (fromEnv) return fromEnv.includes("://") ? fromEnv : `https://${fromEnv}`
  if (process.env.VERCEL_ENV === "production") return PRODUCTION_SITE
  const vercel = process.env.VERCEL_URL?.trim()?.replace(/\/+$/, "")
  if (vercel) return `https://${vercel}`
  return process.env.NODE_ENV === "development" ? "http://localhost:3000" : PRODUCTION_SITE
}

export async function GET() {
  const base = siteBaseForStellarToml()
  const icon = `${base}/phaser-liq-token.png`
  const expert = stellarExpertPhaserLiqUrl()
  const liqCode = classicLiqCodeForStellarToml()
  const liqIssuer = classicLiqIssuerForStellarToml()

  const body = `VERSION="2.0.0"
NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE}"
ACCOUNTS=[]
[[CURRENCIES]]
code="${liqCode}"
issuer="${liqIssuer}"
script="${TOKEN_ADDRESS}"
name="Phase Liquidity"
desc="PHASERLIQ utility liquidity token for PHASE settlement flows."
image="${icon}"
display_decimals=7
# Soroban contract metadata (custom extensions for wallets/indexers)
PHASER_LIQ_CONTRACT_ID="${TOKEN_ADDRESS}"
PHASER_LIQ_ICON="${icon}"
PHASER_LIQ_STELLAR_EXPERT="${expert}"
PHASER_LIQ_X402_DOCS="https://developers.stellar.org/docs/build/agentic-payments/x402"
PHASER_LIQ_X402_NPM="https://www.npmjs.com/package/x402-stellar"
PHASER_LIQ_NODE_DECLARATION_DOCS="https://developers.stellar.org/docs/validators/tier-1-orgs#declare-your-node"
`

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      // Freighter / dApp (Origin www.phasee.xyz) y stellar.expert deben poder leer el TOML (CORS).
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  })
}
