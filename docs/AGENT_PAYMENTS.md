# PHASE Agent Payments — x402 Autonomous Payment Guide

## The core concept

> "I pay the agent, the agent works for me."

x402 is the payment layer between AI agents and PHASE's Forge Oracle. The flow is:

1. Your agent calls `/api/agent/forge` with a prompt.
2. The agent's server wallet pays **1.00 PHASELQ** on the Stellar testnet — no human clicks, no browser popup.
3. The payment is verified on-chain against the PHASE protocol contract.
4. The Forge Oracle generates the artifact (lore + image).
5. The image is pinned to IPFS.
6. The response tells you who paid, how much, the on-chain proof, and the generated artifact.

The agent does not ask you to approve anything. It holds a small PHASELQ balance, pays autonomously, and delivers the work.

---

## Response shape

```json
{
  "success": true,
  "payer": "GXXXXXX...agent-wallet",
  "amountPaid": "1.00 PHASELQ",
  "txHash": "abc123...stellar-tx-hash",
  "imageUrl": "https://... or data:image/png;base64,...",
  "lore": "A fractured crystal shard from a collapsed star...",
  "ipfsCid": "QmXxx...",
  "tokenId": null,
  "collectionId": 0
}
```

`tokenId` is `null` until a separate on-chain mint step is triggered. The artifact (lore + image) is generated and IPFS-pinned in this single call.

---

## Required environment variables

Add these to `.env.local` (never commit this file):

```bash
# Stellar secret key for the agent wallet (S... 56-char key).
# This wallet pays PHASELQ on every forge request.
AGENT_STELLAR_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# API key callers must include as: Authorization: Bearer <key>
# Generate a random value: openssl rand -hex 32
AGENT_API_KEY=your-secret-api-key-here
```

Optional — required for IPFS pinning:
```bash
# Pinata JWT for IPFS uploads (https://app.pinata.cloud/keys)
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Agent wallet setup

The agent wallet is a standard Stellar account. Fund it once before using the endpoint.

### 1. Generate a keypair

```bash
# Using the Stellar Laboratory or any Stellar SDK tool.
# Alternatively, with Node:
node -e "const sdk = require('@stellar/stellar-sdk'); const kp = sdk.Keypair.random(); console.log('Public:', kp.publicKey(), '\nSecret:', kp.secret())"
```

Save the **secret key** to `AGENT_STELLAR_SECRET_KEY` in `.env.local`.

### 2. Fund with XLM (testnet)

```bash
curl "https://friendbot.stellar.org?addr=<AGENT_PUBLIC_KEY>"
```

The agent needs at least ~5 XLM as a reserve and for transaction fees.

### 3. Add the PHASELQ trustline

The agent must hold a trustline to the PHASELQ classic asset before it can receive or spend it. Use the Stellar Laboratory (testnet) to submit a `changeTrust` operation, or run:

```bash
# Using Stellar CLI
stellar tx new change-trust \
  --asset "PHASELQ:<ISSUER_ADDRESS>" \
  --source <AGENT_SECRET_KEY> \
  --network testnet
```

### 4. Fund the agent wallet with PHASELQ

Use the PHASE faucet (`/api/faucet`) or transfer from a funded account:

```bash
curl -X POST https://phasee.xyz/api/faucet \
  -H "Content-Type: application/json" \
  -d '{"address": "<AGENT_PUBLIC_KEY>"}'
```

Each forge request costs **1.00 PHASELQ** (10,000,000 stroops). Make sure the agent wallet has enough balance for the expected number of requests.

---

## Example curl call

```bash
export AGENT_API_KEY="your-secret-api-key-here"

curl -X POST https://phasee.xyz/api/agent/forge \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A fractured crystal shard from a collapsed star"}'
```

Expected response:

```json
{
  "success": true,
  "payer": "GXXXXXX...",
  "amountPaid": "1.00 PHASELQ",
  "txHash": "a1b2c3d4...",
  "imageUrl": "https://image.pollinations.ai/...",
  "lore": "Born in stellar collapse, this shard carries the memory of a dying sun...",
  "ipfsCid": "QmXxx...",
  "tokenId": null,
  "collectionId": 0
}
```

---

## Errors

| Status | Meaning |
|--------|---------|
| `401` | Missing or invalid `AGENT_API_KEY` bearer token |
| `400` | Missing or empty `prompt` field |
| `503` | `AGENT_STELLAR_SECRET_KEY` not configured on the server |
| `502` | x402 challenge fetch or on-chain settlement failed |
| `500` | Payment confirmed but AI generation failed (check server logs) |

---

## Security notes

- **Never expose `AGENT_STELLAR_SECRET_KEY`** in client bundles, logs, or version control. It is a live spending key.
- The secret key is only read server-side via `process.env`. Next.js never includes server-only env vars in the client bundle.
- **Rate limit this endpoint** in production. Each call spends PHASELQ from the agent wallet. A misconfigured or leaked `AGENT_API_KEY` will drain the balance.
- Use a dedicated agent wallet with a small balance. Refill it manually or via a scheduled job rather than pre-loading a large amount.
- Rotate `AGENT_API_KEY` periodically; it is just a bearer token and should be treated as a secret.
- On testnet, PHASELQ has no real value. On mainnet (when available), ensure the agent wallet is funded deliberately.

---

## How x402 works under the hood

```
Agent ──POST /api/agent/forge──► Server
                                    │
                                    ▼
                           POST /api/forge-agent (no auth)
                                    │
                                    ▼
                              ← 402 + challenge JSON
                                    │
                         Build Soroban settle() tx
                         Sign with AGENT_STELLAR_SECRET_KEY
                         Submit to testnet RPC
                         Poll until CONFIRMED
                                    │
                                    ▼
                           POST /api/forge-agent
                             settlementTxHash + payerAddress
                                    │
                                    ▼
                         forge-agent verifies on-chain
                         Gemini generates lore + image
                         Pinata pins image to IPFS
                                    │
                                    ▼
Agent ◄── { payer, amountPaid, txHash, imageUrl, lore, ipfsCid }
```

The settle transaction calls `settle(payer, token, amount, invoiceId, collectionId)` on the PHASE protocol Soroban contract. The forge-agent verifies this transaction on-chain before running AI generation — no trust in the caller, only ledger truth.
