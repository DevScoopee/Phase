# P H A S E   P R O T O C O L

PHASE is a **cyber-brutalist** web application on **Stellar Soroban testnet**: creators **forge** on-chain collections, the **market** lists them, and the **fusion chamber** runs **x402-style settlement** so users pay **PHASER_LIQ** and receive a **utility NFT** (metadata aligned with **SEP-20**). This is experimental software—not financial advice.

---

## Documentation map

| Resource | Description |
|----------|-------------|
| **[In-app docs (`/docs`)](http://localhost:3000/docs)** | Full product guide in EN/ES: assets, contracts, architecture, flows, external links. |
| **[`docs/PHASER_LIQ_REWARDS_TERMINAL_DOC.md`](./docs/PHASER_LIQ_REWARDS_TERMINAL_DOC.md)** | Faucet / genesis / daily / quests API and operator notes. |
| **[`contracts/README.md`](./contracts/README.md)** | Build, optimize, deploy, and invoke Soroban WASM locally. |
| **[`PROMPT_MAESTRO_PHASE.md`](./PROMPT_MAESTRO_PHASE.md)** | High-level agent brief: stack, x402 flow, component map. |

---

## Brand assets (static files)

Served from `public/` at the **site root**. After deploy, prefix with your origin (set `NEXT_PUBLIC_SITE_URL` for correct Open Graph absolute URLs).

| Path | Role |
|------|------|
| [`/og-phase.png`](./public/og-phase.png) | Open Graph / Twitter Card preview (social share). |
| [`/icon-sphere.png`](./public/icon-sphere.png) | Favicon and Apple touch icon (reactor sphere). |
| [`/phaser-liq-token.png`](./public/phaser-liq-token.png) | PHASER_LIQ icon in UI and [`stellar.toml`](./public/.well-known/stellar.toml) currency metadata. |
| [`/.well-known/stellar.toml`](./public/.well-known/stellar.toml) | SEP-0001 file for explorers (static); the app may also expose a dynamic route. |

Metadata defaults live in [`app/layout.tsx`](./app/layout.tsx) (`title.template`, `openGraph`, `twitter`, `icons`).

---

## On-chain contracts (testnet defaults)

Values match [`lib/phase-protocol.ts`](./lib/phase-protocol.ts). Override with environment variables for your deployment.

| Role | Contract ID | Stellar Expert (testnet) |
|------|-------------|---------------------------|
| **PHASE Protocol** (collections, phase, NFT utility) | `CDXZ2HWPSAU3DKACNGTTY3WM6FKN5LPNGMAYFW4KBF74P42RK6SFDRGP` | [Open contract ↗](https://stellar.expert/explorer/testnet/contract/CDXZ2HWPSAU3DKACNGTTY3WM6FKN5LPNGMAYFW4KBF74P42RK6SFDRGP) |
| **PHASER_LIQ** (Soroban token, 7 decimals) | `CDW3T2DXLNGMQDZLMINEF3QHXYDB3F4ZJOGQSKW6QYABA4HMUFRG7DXC` | [Open contract ↗](https://stellar.expert/explorer/testnet/contract/CDW3T2DXLNGMQDZLMINEF3QHXYDB3F4ZJOGQSKW6QYABA4HMUFRG7DXC) |

**Network**

- Passphrase: `Test SDF Network ; September 2015`
- Soroban RPC: `https://soroban-testnet.stellar.org`
- Horizon: `https://horizon-testnet.stellar.org`

**Env (client / server)**

- `NEXT_PUBLIC_PHASE_PROTOCOL_ID` / `PHASE_PROTOCOL_ID` — protocol contract
- `NEXT_PUBLIC_TOKEN_CONTRACT_ID` / `TOKEN_CONTRACT_ID` / `MOCK_TOKEN_ID` — PHASER_LIQ token contract

---

## How it works

1. **Forge (`/forge`)** — Connect **Freighter**, set collection name, **PHASER_LIQ** mint price, and image (URL, sealed upload when server upload is enabled, or built-in studio). Submits **`create_collection`**; share `/chamber?collection=<id>`.
2. **Market (`/dashboard`)** — Catalog of collections; **collection `0`** is the protocol default pool. Links into the chamber per collection.
3. **Chamber (`/chamber`)** — Wallet status, balance, x402 price, **settlement** / **initiate_phase**, artifact view, optional **genesis** path, **LIQ rewards** panel (`/api/faucet`).
4. **x402 API** — `app/api/x402` (`verify`, `settle`, `supported`, challenge) for local compatibility; use a production **facilitator** for real deployments ([Stellar x402 docs](https://developers.stellar.org/docs/build/agentic-payments/x402)).
5. **Optional classic asset** — `CLASSIC_LIQ_*` / `NEXT_PUBLIC_CLASSIC_*` for Freighter trustline UX alongside Soroban.

---

## Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS
- **Contracts:** Rust, Soroban (see `contracts/`)
- **Wallet:** Freighter (`@stellar/freighter-api`, `@stellar/stellar-sdk`)

---

## Local development

```bash
npm install
cp .env.local.example .env.local
# Edit .env.local — never commit secrets
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). In-app documentation: [http://localhost:3000/docs](http://localhost:3000/docs).

---

## Security & operations

- Do not commit **private keys**, **JWTs**, or **`.env.local`** (gitignored).
- Production: secret manager for `ADMIN_SECRET_KEY`, server upload credentials, etc.
- Testnet only; redeploying WASM changes contract addresses—update env and docs together.

---

## License / attribution

Built as an experimental PHASE interface; see repository files for any third-party notices.
