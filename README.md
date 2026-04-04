# PHASE

PHASE is a Stellar/Soroban experimental app that combines:

- A creator forge to publish collections.
- A chamber to execute x402 payment flows.
- A dashboard to browse community collections.
- On-chain utility collectible logic aligned with SEP-50.

## Stack

- Next.js (App Router) + React + Tailwind CSS
- Soroban contracts (Rust)
- Stellar tooling (`@stellar/stellar-sdk`, Freighter integration)

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Create a local env file:

```bash
cp .env.local.example .env.local
```

Do not commit secrets. Sensitive files are excluded via `.gitignore`.

## Notes

- This repository intentionally avoids storing credentials, private keys, and local runtime claim data.
- Production deployments should use secure secret management and audited contract configurations.
