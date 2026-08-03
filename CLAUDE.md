# CLAUDE.md — PHASE Project

Project-level instructions for Claude Code. These take priority over default behavior and superpowers skills.

## Project Overview

PHASE is a Next.js + Soroban testnet application for NFT minting, settlement, and reward distribution on the Stellar network. See `PROJECT_ARCHITECTURE.md` for the full architecture reference.

## Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Wallet**: Freighter / Stellar Wallet Kit (`lib/stellar-wallet-kit.ts`)
- **Contracts**: Soroban (Rust), deployed to Stellar testnet
- **API**: Next.js route handlers (`app/api/`)
- **Data**: JSON file store via `lib/server-data-paths.ts`
- **Payments**: Classic LIQ (`lib/classic-liq.ts`) + x402 protocol

## Key Conventions

- **Signing boundary**: All wallet signing happens client-side via Freighter. Server never holds user keys.
- **Secrets**: Only in server runtime. Never commit `.env.local` or any `.env*.local`.
- **i18n**: All user-facing strings go through `lib/phase-copy.ts` → `pickCopy(lang)`. No hardcoded UI text in components.
- **Error handling**: Normalize domain errors before UI messaging. On-chain gate error `#13` maps to `[ ERROR: BIOMETRIC_TRUST_GATE_CLOSED ]`.
- **API contracts**: Typed request/response payloads. Deterministic status codes. No implicit success.
- **Architecture docs**: Any architectural change requires updating `PROJECT_ARCHITECTURE.md` and `docs/TECHNICAL.md`.

## Workflow Preferences

- Read files before modifying them.
- Do not add docstrings, comments, or type annotations to code you didn't change.
- Do not create helpers for one-time operations.
- No backwards-compatibility hacks — change the code directly.
- Prefer editing existing files over creating new ones.
- Use the task-logger skill after completing meaningful work (`.claude/skills/task-logger/SKILL.md`).

## Directory Structure

```
app/              Next.js pages and API routes
components/       React components
contracts/        Soroban (Rust) smart contracts
lib/              Shared utilities and protocol logic
scripts/          CLI and deployment scripts
docs/             Technical documentation
.claude/          Claude-specific config (gitignored)
  agents/         Subagent definitions
  skills/         Project-scoped skills
  logs/           Daily task logs
  plans/          Implementation plans
```

## Testnet Context

All contract interactions target Stellar testnet:
- RPC: `https://soroban-testnet.stellar.org`
- Passphrase: `Test SDF Network ; September 2015`
- Contract IDs are in `.env.local` — never hardcode them.

## Agents

- **liq-payment-operator**: Use for LIQ/settlement payment diagnosis and operations (`.claude/agents/liq-payment-operator.md`).
