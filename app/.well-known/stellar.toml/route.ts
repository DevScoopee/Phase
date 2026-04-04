import { NextResponse } from "next/server"
import { TOKEN_ADDRESS } from "@/lib/phase-protocol"

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"

export async function GET() {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/+$/, "") ||
    (process.env.VERCEL_URL?.trim()
      ? `https://${process.env.VERCEL_URL.trim().replace(/\/+$/, "")}`
      : "http://localhost:3000")
  const icon = `${base}/phaser-liq-token.png`
  const expert = `https://stellar.expert/explorer/testnet/contract/${TOKEN_ADDRESS}`

  const body = `VERSION="2.0.0"
NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE}"
ACCOUNTS=[]
[[CURRENCIES]]
script="${TOKEN_ADDRESS}"
code="PHASERLIQ"
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
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "https://stellar.expert",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://stellar.expert",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  })
}
