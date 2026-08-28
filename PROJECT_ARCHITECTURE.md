# PHASE Project Architecture

This document defines the architecture baseline for PHASE and is the primary reference for implementation decisions, reviews, and refactors.

## 1) Scope and intent

PHASE is a testnet system composed of:

- **Client application** (Next.js) for forge, dashboard, and chamber UX.
- **API layer** (Next.js route handlers) for reward distribution, trustline relay, x402 support, and profile/listing persistence.
- **On-chain contracts** (Soroban) for protocol state and token interactions.
- **Wallet signing boundary** (Freighter) for user-authorized transactions.

The architecture is designed to keep signing on the client while keeping privileged operations on the server.

## 2) High-level component map

```mermaid
flowchart LR
  UI[Next.js App UI] --> Wallet[Freighter]
  UI --> BFF[Next.js API Routes]
  UI --> ChainRead[lib/phase-protocol.ts]
  ChainRead --> RPC[Soroban RPC]
  ChainRead --> HZ[Horizon]
  BFF --> RPC
  BFF --> HZ
  BFF --> Store[(JSON data store)]
  Contracts[phase-protocol WASM + token WASM] --> RPC
```

## 3) Runtime boundaries

### 3.1 Client boundary

Owns:

- Wallet connection and signature prompts.
- Interactive state, tactical UI, i18n rendering.
- Read-only on-chain queries (when safe via SDK simulation helpers).

Must not own:

- Admin secrets.
- Issuer secret for classic bootstrap.
- Persistent trusted state decisions.

### 3.2 Server boundary

Owns:

- Reward minting with admin credentials.
- Trustline submit relay endpoint (for signed XDR).
- Persistent JSON data (`faucet claims`, `artist profile`, `listings`) through `lib/server-data-paths.ts`.
- x402 endpoints and payment verification support.

Must not own:

- User private keys.

### 3.3 On-chain boundary

Owns:

- Canonical protocol state (`collection`, `phase`, utility-NFT ownership, settlement effects).
- Token balances and transfer semantics according to deployed contracts.

## 4) Principal user flows

### 4.1 Forge flow

1. User connects wallet.
2. Optional trustline bootstrap is established where applicable.
3. User submits collection metadata and price.
4. Client builds Soroban tx and asks Freighter signature.
5. Tx is sent and confirmed; collection ID is resolved.

### 4.2 Chamber settlement flow

1. Client fetches wallet state and collection price.
2. User executes settlement action.
3. Client signs and submits transaction.
4. On success, chamber refreshes artifact and ownership state.

### 4.3 Rewards flow

1. Client queries `/api/faucet` status.
2. If classic trustline is required, user signs `changeTrust`.
3. Client submits signed trustline to `/api/classic-liq/trustline`.
4. Client calls reward claim endpoint (`/api/faucet` or compatibility route).
5. Server mints reward when conditions are met.

## 5) API architecture principles

- **Typed contracts** for request/response payloads in route handlers.
- **Deterministic status codes** (validation, cooldown, authorization, pending).
- **No implicit success**: all state transitions explicit and auditable.
- **Compatibility routes** allowed if typed and documented.

## 6) Internationalization architecture

- UI strings belong to `lib/phase-copy.ts`.
- Components consume text via `pickCopy(lang)` and must avoid hardcoded user-facing literals.
- New features require EN/ES keys before merge.

## 7) Error-handling architecture

- Domain-level error normalization is required before UI messaging.
- Unauthorized on-chain gate errors (`#13`) map to narrative tactical message:
  - `[ ERROR: BIOMETRIC_TRUST_GATE_CLOSED ]`
- User-facing failures should remain actionable and non-ambiguous.

## 8) Performance architecture (UI)

- Tactical animation classes use GPU compositing hints where flicker/pulse is intentional.
- Keep animations isolated to key controls; avoid broad repaint cascades.
- Prefer CSS primitives and avoid JS-driven animation loops unless required for state logic.

## 9) Security architecture

- Secrets only in server runtime configuration.
- `.env.local` and sensitive keys are never committed.
- Testnet-only assumptions must be explicit in docs and code comments.
- Any privileged operation must validate input shape and origin intent.

## 10) Feature flags (rolling delivery)

| Flag | Env | Purpose | Default | Rollback |
|------|-----|---------|---------|----------|
| `phase-104` | `NEXT_PUBLIC_FEATURE_PHASE_104` / `FEATURE_PHASE_104` | Two-factor confirmation for high-value profile changes (display name, socials) | off | Unset var, restart — profile changes apply immediately again, no confirmation required |
| `phase-105` | `NEXT_PUBLIC_FEATURE_PHASE_105` / `FEATURE_PHASE_105` | Narrative branch divergence detection for co-authored worlds (optimistic concurrency on `version`) | off | Unset var, restart — world saves revert to unconditional overwrite; no data migration |
| `phase-106` | `NEXT_PUBLIC_FEATURE_PHASE_106` / `FEATURE_PHASE_106` | Lore versioning with word-level diffing (spike/PoC) | off | Unset var, restart — version recording stops; existing version history remains on disk, unused |
| `phase-110` | `NEXT_PUBLIC_FEATURE_PHASE_110` / `FEATURE_PHASE_110` | Narrative search indexed by entity (token) and location (world) | off | Unset var, restart — `GET /api/world/search` returns 404, no data migration |
| `phase-116` | `NEXT_PUBLIC_FEATURE_PHASE_116` / `FEATURE_PHASE_116` | Narrative contributor attribution & credit ledger (co-author on-chain credit) | off | Unset var, restart — ledger reads return empty, writes no-op; JSON sidecar remains on disk (no ledger revert) |
| `phase-117` | `NEXT_PUBLIC_FEATURE_PHASE_117` / `FEATURE_PHASE_117` | Multi-gateway IPFS pinning with redundancy (quorum, gateway fallback) | off | Unset var, restart — pin reverts to single Pinata gateway, avatar reads use legacy single URL |
| `phase-119` | `NEXT_PUBLIC_FEATURE_PHASE_119` / `FEATURE_PHASE_119` | CID content-addressing cache with integrity checks (tamper-evident) | off | Unset var, restart — cache disabled, verification skipped; cached files remain inert |
| `phase-120` | `NEXT_PUBLIC_FEATURE_PHASE_120` / `FEATURE_PHASE_120` | IPFS upload retry with exponential backoff + checksum verification | off | Unset var, restart — upload reverts to single-shot Pinata POST, no retry/checksum; prior pins remain on IPFS |
| `phase-121` | `NEXT_PUBLIC_FEATURE_PHASE_121` / `FEATURE_PHASE_121` | Gateway health dashboard with latency scoring | off | Unset var, restart — dashboard returns 404, protocol falls back to static gateway list |
| `phase-122` | `NEXT_PUBLIC_FEATURE_PHASE_122` / `FEATURE_PHASE_122` | Off-chain metadata delta storage (reduce on-chain rent) | off | Unset var, restart — verify falls back to on-chain `token_uri`, off-chain files remain on disk (no ledger revert) |
| `phase-123` | `NEXT_PUBLIC_FEATURE_PHASE_123` / `FEATURE_PHASE_123` | IPFS timeout fallback chain across providers | off | Unset var, restart — reverts to 8s sequential fallback; no data migration |
| `phase-124` | `NEXT_PUBLIC_FEATURE_PHASE_124` / `FEATURE_PHASE_124` | Metadata version migration tool (v1→v2) | off | Unset var, restart — v2 payloads remain readable as v1 where additive; no destructive rewrite without `--apply` |

Flags are read via `lib/feature-flags.ts:isFeatureEnabled`. Client flags use `NEXT_PUBLIC_*`, server also accepts `FEATURE_*`. Zero regression when off.

## 11) Change-management rules

- Architectural changes require updates to:
  - `PROJECT_ARCHITECTURE.md` (this file)
  - `docs/TECHNICAL.md`
  - relevant API docs
- Contract/address changes require synchronized env and docs updates.
- Flag-gated features must document rollback in this table and in `docs/TECHNICAL.md` § Feature Flags.
