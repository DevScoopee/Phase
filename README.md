# PHASE Protocol

**PHASE** is a community NFT protocol on **Stellar testnet** — built on Soroban smart contracts, powered by x402 payments, and surfaced through a Next.js terminal-aesthetic web app.

Artists forge collections, the Oracle AI generates on-chain art, and every participant earns a utility NFT on the Stellar ledger.

---

## How it works

```
Artist describes anomaly → Oracle (AI) generates image → x402 payment (PHASELQ)
→ Soroban mint → NFT issued to wallet → Community explores on /explore
```

1. **Forge** — A creator registers a collection (`create_collection`) with a name, PHASELQ price, and image URI. The Oracle pipeline generates art via AI and pins it to IPFS.
2. **Settle** — A participant pays the collection price in PHASELQ via the x402 protocol. The server calls `initiate_phase` on the Soroban contract, minting the utility NFT.
3. **Collect** — The NFT lives in issuer custody post-mint. The participant hits Collect and the server signs a transfer to their connected wallet — no wallet signature required from the user.
4. **Explore** — `/explore` shows every NFT minted on the protocol, watermarked, with collection and holder info.
5. **Trade** — The Dashboard lists collections and lets holders transfer or list their NFTs peer-to-peer.

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Wallet | [Stellar Wallets Kit](https://github.com/creit-tech/StellarWalletsKit) — Freighter, Albedo, xBull |
| Smart contracts | Soroban (Rust) on Stellar testnet |
| Payment protocol | [x402](https://x402.org) — HTTP 402 Payment Required |
| NFT standard | SEP-50 draft (`token_uri`, `token_metadata`, `owner_of`) |
| Token indexing | [Mercury Classic](https://mercurydata.app) |
| IPFS | Pinata (pinning) + multi-gateway server-side proxy |
| API | Next.js route handlers — all server-side secrets stay server-side |

### Mercury

PHASE uses **Mercury Classic** as its token indexing layer. When a wallet queries its NFT holdings, Mercury's `GET /events/by-contract` API returns the full mint and transfer event history for the PHASE Soroban contract — resolving ownership in milliseconds without iterating every token ID via raw Soroban RPC.

Mercury is integrated in `lib/mercury-classic.ts`. When `MERCURY_JWT` and `MERCURY_INSTANCE_URL` are set, all `/api/wallet/phase-nfts` queries go through Mercury. Without those env vars, the app falls back to a concurrent Soroban RPC scan (slower but fully functional).

---

## Deployed contracts (testnet)

| Contract | Description |
|----------|-------------|
| PHASE Protocol | Core NFT logic — `create_collection`, `initiate_phase`, `settle`, `owner_of`, `token_uri` |
| PHASELQ SAC | Stellar Asset Contract wrapping the classic PHASELQ token |

Contract IDs are stored in environment variables — see `.env.local.example`.

---

## Key pages

| Route | Description |
|-------|-------------|
| `/` | Landing — protocol overview |
| `/forge` | Create a collection + Oracle AI pipeline |
| `/chamber` | Mint (x402 settle) + artifact viewer + Collect CTA |
| `/dashboard` | Community collection catalog + holder vault |
| `/explore` | Browse all minted NFTs (watermarked community gallery) |

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_PHASE_CONTRACT_ID` | Yes | PHASE Protocol Soroban contract address |
| `NEXT_PUBLIC_TOKEN_ADDRESS` | Yes | PHASELQ SAC contract address |
| `NEXT_PUBLIC_SITE_URL` | Yes (Vercel) | Public base URL (e.g. `https://www.phasee.xyz`) |
| `PHASE_ISSUER_SECRET` | Yes | Classic PHASELQ issuer secret — server-only, never exposed |
| `PINATA_JWT` | Yes | Pinata API JWT for IPFS uploads |
| `MERCURY_JWT` | Optional | Mercury Classic JWT — enables fast NFT indexing |
| `MERCURY_INSTANCE_URL` | Optional | Mercury instance base URL |
| `NEXT_PUBLIC_PHASE_IPFS_GATEWAY` | Optional | Override IPFS gateway base (default: `dweb.link`) |
| `NEXT_PUBLIC_OG_IMAGE_URL` | Optional | Override OG/fallback NFT image URL |

---

## Network

- **Soroban RPC:** `https://soroban-testnet.stellar.org`
- **Horizon:** `https://horizon-testnet.stellar.org`
- **Network passphrase:** `Test SDF Network ; September 2015`

---

*PHASE runs on Stellar testnet. Never commit secrets or private keys.*
