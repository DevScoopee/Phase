import type { Metadata } from "next"

const TITLE       = "Documentation — P H A S E Protocol"
const DESCRIPTION =
  "Complete technical reference for the PHASE Protocol: on-chain AI paywall architecture, " +
  "x402 Stellar payment settlement, artifact lifecycle (register → pay → mint), " +
  "PHASELQ token spec (SEP-41), Soroban smart contract API, and reward system. " +
  "Everything you need to build on or integrate with PHASE."

export const metadata: Metadata = {
  title:       TITLE,
  description: DESCRIPTION,
  openGraph: {
    title:       TITLE,
    description: DESCRIPTION,
    type:        "website",
    images: [
      {
        url:    "/og-docs.jpg",
        width:  1200,
        height: 630,
        alt:    "PHASE Protocol — Document Archive terminal screen",
      },
    ],
  },
  twitter: {
    card:        "summary_large_image",
    title:       TITLE,
    description: DESCRIPTION,
    images:      ["/og-docs.jpg"],
  },
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
