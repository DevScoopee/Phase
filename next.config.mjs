/** @type {import('next').NextConfig} */
const nextConfig = {
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
          { key: "Access-Control-Allow-Origin", value: "https://stellar.expert" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ]
  },
}

export default nextConfig
