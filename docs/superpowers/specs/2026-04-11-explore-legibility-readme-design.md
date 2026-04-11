# PHASE — Explore, Legibility & README Design

**Date:** 2026-04-11  
**Branch:** feature/wallet-kit  
**Status:** Approved

---

## 1. Explore Page (`/explore`)

### Goal
A public, read-only gallery of every NFT minted on PHASE — community browse mode. All NFTs shown with watermark since the viewer is never the owner.

### Architecture

**New endpoint:** `GET /api/explore/route.ts`
- Iterates token IDs from 1 up to a cap (env `PHASE_EXPLORE_SCAN_CAP`, default 500) using concurrent `fetchTokenOwnerAddress` calls.
- For each found token, calls `buildPhaseTokenMetadataJson` to get name/image/collectionId.
- Returns `{ items: ExploreItem[], total: number }` with optional `?page=N&perPage=25` query params.
- `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `Cache-Control: public, s-maxage=60`.

```ts
type ExploreItem = {
  tokenId: number
  name: string
  image: string        // proxied via /api/ipfs/...
  collectionId: number | null
  ownerTruncated: string
}
```

**New page:** `app/explore/page.tsx`
- `"use client"` — fetches `/api/explore` on mount.
- Terminal cockpit layout matching fusion-chamber aesthetic.
- Grilla: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` of NFT cards.
- Each card: `PhaseProtectedPreview` (locked/watermarked) + collection name + `SERIAL_ID #N` + owner + "Open Chamber" link.
- Pagination: prev/next buttons, page indicator in terminal style.
- Loading skeleton: ASCII spinner + `SCANNING_LEDGER…` label.
- Empty state: `NO_ARTIFACTS_DETECTED`.
- Header nav links: HOME / FORGE / DASHBOARD.

### UI style
- Same `tactical-frame`, `tactical-phosphor`, monospace classes as rest of app.
- Cards: `border-2 border-cyan-500/40 bg-black/55`.
- Section title: `◈ COMMUNITY_ARTIFACTS // PHASE_LEDGER`.

---

## 2. Global Text Legibility

### Problem
Fonts render blurry — missing antialiasing + some text colors have very low opacity (e.g. `/55`, `/50`).

### Fix
Two targeted changes:

**`app/layout.tsx` or `styles/globals.css`:**
```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

**Global CSS:** ensure the above is in the `:root` or `body` block in `styles/globals.css`. Also bump the `@layer base` body rule if it exists.

No component changes needed — this fixes rendering at the CSS level.

---

## 3. README Rewrite

### Goal
Professional GitHub README that describes PHASE as a real product, not a dev project.

### Structure
1. **Header** — project name, one-liner, badges (testnet, Next.js, Soroban)
2. **What is PHASE** — NFT protocol on Stellar/Soroban, x402 AI-to-NFT pipeline
3. **How it works** — user flow: Forge → x402 settlement → Soroban mint → Collect → Trade
4. **Architecture** — stack table: Next.js 14, Soroban contracts, Stellar Wallet Kit, x402, SEP-50
5. **Mercury** — explain Mercury Classic as the indexing layer: how we use it to scan token ownership efficiently without iterating all IDs via RPC
6. **Contract** — deployed contract ID on testnet, key functions
7. **Key pages** — `/` landing, `/forge`, `/chamber`, `/dashboard`, `/explore`
8. **Environment variables** — list of required vars (no values, just names + descriptions)

### Excluded
- Local setup / `npm run dev` instructions
- "Credits to Mercury" section
- Contributing guide

---

## Spec Self-Review

- No placeholders or TBDs.
- Explore endpoint reuses existing `buildPhaseTokenMetadataJson` — no new on-chain logic.
- Legibility fix is purely CSS — zero risk of visual regression to existing style.
- README structure is complete and self-consistent.
- Scope is focused: 3 independent deliverables, no shared state.
