import type React from "react"
import type { Metadata } from "next"
import { IBM_Plex_Sans, IBM_Plex_Mono, Bebas_Neue, Orbitron } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AppProviders } from "@/components/app-providers"
import { SmoothScroll } from "@/components/smooth-scroll"
import "./globals.css"

function siteMetadataBase(): URL {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/+$/, "")
  if (fromEnv) return new URL(fromEnv.includes("://") ? fromEnv : `https://${fromEnv}`)
  const vercel = process.env.VERCEL_URL?.trim()?.replace(/\/+$/, "")
  if (vercel) return new URL(`https://${vercel}`)
  return new URL("https://your-domain.com")
}

const ibmPlexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
})
const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
})
const bebasNeue = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" })
const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["600", "700", "800"],
})

const defaultTitle = "P H A S E   P R O T O C O L"
const defaultDescription =
  "Transform liquid energy into solid-state artifacts. The definitive x402 settlement engine for creators on the Soroban network. Connect your terminal."

export const metadata: Metadata = {
  metadataBase: siteMetadataBase(),
  title: {
    template: "%s | P H A S E",
    default: defaultTitle,
  },
  description: defaultDescription,
  keywords: ["Stellar", "Soroban", "Web3", "x402", "NFT", "Digital Artifacts", "SEP-20"],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: defaultTitle,
    description: defaultDescription,
    siteName: "P H A S E",
    images: [
      {
        url: "/og-phase.png",
        width: 1200,
        height: 630,
        alt: "PHASE Protocol — A hooded figure forging liquid energy on Stellar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: ["/og-phase.png"],
  },
  icons: {
    icon: [{ url: "/icon-sphere.png", type: "image/png" }],
    apple: [{ url: "/icon-sphere.png", type: "image/png" }],
    shortcut: "/icon-sphere.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-background">
      <body
        className={`${ibmPlexSans.variable} ${bebasNeue.variable} ${ibmPlexMono.variable} ${orbitron.variable} font-sans antialiased overflow-x-hidden`}
      >
        <div className="noise-overlay" aria-hidden="true" />
        <SmoothScroll>
          <AppProviders>{children}</AppProviders>
        </SmoothScroll>
        <Analytics />
      </body>
    </html>
  )
}
