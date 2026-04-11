/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@creit.tech/stellar-wallets-kit"],
  // Rust build trees are committed in this repo; exclude from serverless traces (250 MB limit on Vercel).
  outputFileTracingExcludes: {
    "*": ["./contracts/**/*", "./scripts/**/*"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/.well-known/stellar.toml",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
      {
        source: "/phaser-liq-token.png",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
          { key: "Cache-Control", value: "public, max-age=86400, immutable" },
        ],
      },
    ]
  },
}

export default nextConfig
