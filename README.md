# PHASE Protocol

PHASE is a Stellar testnet application for creating and operating utility-NFT collections with PHASERLIQ settlement.  
The stack combines Next.js (App Router), Soroban contracts, Freighter signing, and server-side reward/bootstrap APIs.

## What the product does

- **Forge (`/forge`)**: creators register collections (`create_collection`) with name, price, and image URI.
- **Dashboard (`/dashboard`)**: collection catalog and listing/transfer UX.
- **Chamber (`/chamber`)**: settlement flow (`settle` / `initiate_phase`), artifact verification view, and rewards panel.
- **Rewards**: faucet and quest system for testnet onboarding (`/api/faucet`) plus optional classic asset trustline flow.

## Documentation

| Document | Purpose |
|---|---|
| [`PROJECT_ARCHITECTURE.md`](./PROJECT_ARCHITECTURE.md) | System architecture baseline (contexts, components, runtime boundaries, data flow). |
| [`docs/TECHNICAL.md`](./docs/TECHNICAL.md) | Technical specification: APIs, env vars, on-chain integration, operational behavior. |
| [`docs/PHASER_LIQ_REWARDS_TERMINAL_DOC.md`](./docs/PHASER_LIQ_REWARDS_TERMINAL_DOC.md) | Reward engine and trustline-first execution details (ES/EN). |
| [`contracts/README.md`](./contracts/README.md) | Soroban contract build/deploy/invoke workflow. |
| [`PROMPT_MAESTRO_PHASE.md`](./PROMPT_MAESTRO_PHASE.md) | Product brief and implementation intent. |

## Network and contracts (testnet)

- **Network passphrase**: `Test SDF Network ; September 2015`
- **Soroban RPC**: `https://soroban-testnet.stellar.org`
- **Horizon**: `https://horizon-testnet.stellar.org`
- **Source of truth for default IDs**: `lib/phase-protocol.ts`

## Quick start

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open:
- App: [http://localhost:3000](http://localhost:3000)
- In-app docs: [http://localhost:3000/docs](http://localhost:3000/docs)

## Operational notes

- Never commit secrets (`.env.local`, private keys, JWTs).
- This repository is testnet-oriented; rotate keys if exposed.
- If you redeploy contracts, update env vars and docs together.
