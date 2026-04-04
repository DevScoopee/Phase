import { NextRequest, NextResponse } from "next/server"
import { REQUIRED_AMOUNT, TOKEN_ADDRESS } from "@/lib/phase-protocol"

const X402_NETWORK = "stellar:testnet"

function facilitatorUrl(request: NextRequest): string {
  const configured = process.env.X402_FACILITATOR_URL?.trim()
  if (configured) return configured
  return `${request.nextUrl.origin}/api/x402`
}

export async function GET(request: NextRequest) {
  const facilitator = facilitatorUrl(request)
  return NextResponse.json({
    protocol: "x402",
    version: "2",
    network: X402_NETWORK,
    facilitator,
    endpoints: {
      verify: `${facilitator}/verify`,
      settle: `${facilitator}/settle`,
      supported: `${facilitator}/supported`,
    },
    assets: [
      {
        token_contract: TOKEN_ADDRESS,
        amount: Number.parseInt(REQUIRED_AMOUNT, 10),
      },
    ],
  })
}
