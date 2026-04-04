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
  const issuer = process.env.TOKEN_ISSUER?.trim() || process.env.NEXT_PUBLIC_TOKEN_ISSUER?.trim() || ""

  const currenciesBlock = issuer
    ? `[[CURRENCIES]]
code="PHASER_LIQ"
name="Phase Liquidity"
issuer="${issuer}"
desc="PHASER_LIQ token for PHASE protocol liquidity flows."
image="${icon}"
display_decimals=2
`
    : `[[CURRENCIES]]
code="PHASER_LIQ"
name="Phase Liquidity"
desc="PHASER_LIQ token for PHASE protocol liquidity flows."
image="${icon}"
display_decimals=2
`

  const body = `VERSION="2.0.0"
NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE}"
ACCOUNTS=[]
${currenciesBlock}
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
    },
  })
}
