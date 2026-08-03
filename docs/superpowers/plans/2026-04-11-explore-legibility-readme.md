# Explore Page, Global Legibility & README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a community NFT explore page (`/explore`), fix blurry text rendering globally, and rewrite README as a professional project document.

**Architecture:** Three independent deliverables — a CSS one-liner, a new Next.js API route + client page, and a README rewrite. No shared state between tasks; each can be committed separately.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, existing `lib/phase-protocol.ts` utilities, existing `lib/phase-nft-metadata-build.ts`, existing `PhaseProtectedPreview` component.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `styles/globals.css` | Add font-smoothing to body |
| Create | `app/api/explore/route.ts` | Scan all minted tokens, return paginated list |
| Create | `app/explore/page.tsx` | Client explore page — terminal NFT grid |
| Modify | `README.md` | Full professional rewrite |

---

## Task 1: Global Text Legibility Fix

**Files:**
- Modify: `styles/globals.css` (lines `@layer base` → `body` block, around line 122)

- [ ] **Step 1: Add font-smoothing to the body rule**

Open `styles/globals.css`. Find this block:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

Replace it with:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
}
```

- [ ] **Step 2: Verify no build errors**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E " && node_modules/.bin/tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E " && git add styles/globals.css && git commit -m "fix(ui): antialiased font smoothing for sharper text rendering"
```

---

## Task 2: `/api/explore` Endpoint

**Files:**
- Create: `app/api/explore/route.ts`

The endpoint scans `owner_of(1..totalSupply)` concurrently, builds metadata for each found token, and returns a paginated JSON response.

- [ ] **Step 1: Create the route file**

Create `app/api/explore/route.ts` with this exact content:

```ts
import { NextRequest, NextResponse } from "next/server"
import {
  fetchPhaseProtocolTotalSupply,
  fetchTokenOwnerAddress,
  phaseProtocolContractIdForServer,
} from "@/lib/phase-protocol"
import { buildPhaseTokenMetadataJson } from "@/lib/phase-nft-metadata-build"
import { extractBaseAddress } from "@stellar/stellar-sdk"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export type ExploreItem = {
  tokenId: number
  name: string
  image: string
  collectionId: number | null
  ownerTruncated: string
}

function truncateAddress(addr: string): string {
  const t = addr.trim()
  if (t.length < 14) return t
  return `${t.slice(0, 6)}…${t.slice(-4)}`
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    for (;;) {
      const idx = i++
      if (idx >= items.length) return
      out[idx] = await fn(items[idx]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export async function GET(request: NextRequest) {
  const contractId = phaseProtocolContractIdForServer()
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10))
  const perPage = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get("perPage") ?? "24", 10)))

  const total = await fetchPhaseProtocolTotalSupply(contractId)
  if (total <= 0) {
    return NextResponse.json(
      { items: [] as ExploreItem[], total: 0, page, perPage },
      { headers: { ...CORS, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" } },
    )
  }

  // Scan all token IDs concurrently to find those with an owner
  const ids = Array.from({ length: total }, (_, i) => i + 1)
  const owners = await mapConcurrent(ids, 12, async (id) => {
    const owner = await fetchTokenOwnerAddress(contractId, id)
    return owner ? { id, owner } : null
  })
  const found = owners.filter((x): x is { id: number; owner: string } => x !== null)

  // Paginate found tokens
  const totalFound = found.length
  const slice = found.slice((page - 1) * perPage, page * perPage)

  // Build metadata for this page only
  const items = await mapConcurrent(slice, 6, async ({ id, owner }) => {
    const meta = await buildPhaseTokenMetadataJson(contractId, id)
    let ownerBase = owner
    try { ownerBase = extractBaseAddress(owner) } catch { /* keep raw */ }
    return {
      tokenId: id,
      name: meta?.name ?? `Phase Artifact #${id}`,
      image: meta?.image ?? "",
      collectionId: meta?.collectionId ?? null,
      ownerTruncated: truncateAddress(ownerBase),
    } satisfies ExploreItem
  })

  return NextResponse.json(
    { items, total: totalFound, page, perPage },
    {
      headers: {
        ...CORS,
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    },
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E " && node_modules/.bin/tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E " && git add app/api/explore/route.ts && git commit -m "feat(api): /api/explore — paginated community NFT scan endpoint"
```

---

## Task 3: `/explore` Page

**Files:**
- Create: `app/explore/page.tsx`

Terminal-aesthetic client page. Fetches `/api/explore`, renders a watermarked NFT grid with pagination. Imports `PhaseProtectedPreview` (handles locked/watermark state automatically when `chainVerified={false}`).

- [ ] **Step 1: Create the page**

Create `app/explore/page.tsx`:

```tsx
"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { LangToggle } from "@/components/lang-toggle"
import { useLang } from "@/components/lang-context"
import { PhaseProtectedPreview } from "@/components/phase-protected-preview"
import { useWallet } from "@/components/wallet-provider"
import { cn } from "@/lib/utils"
import type { ExploreItem } from "@/app/api/explore/route"

type ExploreResponse = {
  items: ExploreItem[]
  total: number
  page: number
  perPage: number
}

const navLink =
  "inline-flex min-h-[36px] items-center border-2 border-cyan-400/50 bg-cyan-950/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.12)] transition-colors hover:border-cyan-300 hover:bg-cyan-900/40 hover:text-white"

const PREVIEW_LABELS = {
  pendingFusion: "[ PREVIEW_ONLY ]",
  unverifiedCopy: "[ UNVERIFIED ]",
  chainVerifiedSeal: "[ VERIFIED ]",
}

export default function ExplorePage() {
  const { lang } = useLang()
  const { address } = useWallet()

  const [data, setData] = useState<ExploreResponse | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle")
  const [page, setPage] = useState(1)
  const perPage = 24

  const load = useCallback(async (p: number) => {
    setLoadState("loading")
    try {
      const res = await fetch(`/api/explore?page=${p}&perPage=${perPage}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ExploreResponse
      setData(json)
      setLoadState("idle")
    } catch {
      setLoadState("error")
    }
  }, [])

  useEffect(() => {
    void load(page)
  }, [load, page])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / perPage)) : 1

  const isEs = lang === "es"

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <div className="grid-bg pointer-events-none fixed inset-0 opacity-40" aria-hidden />

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b-4 border-double border-cyan-400/55 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className={navLink}>
            {isEs ? "← Inicio" : "← Home"}
          </Link>
        </div>
        <span className="text-center text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200">
          ◈ PHASE · {isEs ? "EXPLORAR" : "EXPLORE"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <LangToggle variant="phosphor" />
          <Link href="/forge" className={navLink}>
            {isEs ? "Forja" : "Forge"}
          </Link>
          <Link href="/dashboard" className={navLink}>
            {isEs ? "Mercado" : "Market"}
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 md:py-12">
        <div className="border-4 border-double border-cyan-400/55 bg-[oklch(0.05_0_0)] p-6 shadow-[0_0_32px_rgba(0,255,255,0.06)] md:p-8">
          <div className="mb-6 border-b border-cyan-400/30 pb-6">
            <h1 className="text-[13px] font-bold uppercase tracking-[0.28em] text-cyan-200 tactical-phosphor">
              ◈ {isEs ? "ARTEFACTOS DE LA COMUNIDAD" : "COMMUNITY_ARTIFACTS"}
            </h1>
            <p className="mt-2 text-[10px] leading-relaxed text-cyan-300/80">
              {isEs
                ? "Todos los NFTs minteados en el protocolo PHASE — con marca de agua. Conectá tu wallet en Chamber para verificar los tuyos."
                : "All NFTs minted on the PHASE protocol — watermarked. Connect your wallet in Chamber to verify yours."}
            </p>
            {data && (
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-500/70">
                {isEs ? `TOTAL_ESTABILIZADOS` : `TOTAL_STABILIZED`}
                {" · "}
                <span className="text-cyan-300/90">{data.total}</span>
                {" · "}
                {isEs ? `PÁGINA ${page} / ${totalPages}` : `PAGE ${page} / ${totalPages}`}
              </p>
            )}
          </div>

          {loadState === "loading" && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/60 border-t-transparent" />
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-400/75 animate-pulse">
                {isEs ? "ESCANEANDO_LEDGER…" : "SCANNING_LEDGER…"}
              </p>
            </div>
          )}

          {loadState === "error" && (
            <p className="py-10 text-center font-mono text-[10px] uppercase tracking-widest text-red-400/90">
              {isEs ? "[ ERROR_RPC — REINTENTÁ ]" : "[ RPC_ERROR — RETRY ]"}
            </p>
          )}

          {loadState === "idle" && data && data.items.length === 0 && (
            <p className="py-10 text-center font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
              {isEs ? "NO_SE_DETECTAN_ARTEFACTOS" : "NO_ARTIFACTS_DETECTED"}
            </p>
          )}

          {loadState === "idle" && data && data.items.length > 0 && (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {data.items.map((item) => (
                  <li
                    key={item.tokenId}
                    className="flex flex-col border-2 border-cyan-500/35 bg-black/55 shadow-[inset_0_1px_0_rgba(34,211,238,0.08)]"
                  >
                    <div className="border-b border-cyan-500/25">
                      <PhaseProtectedPreview
                        uri={item.image}
                        chainVerified={false}
                        viewerAddress={address}
                        labels={PREVIEW_LABELS}
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-3">
                      <p className="line-clamp-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-50">
                        {item.name}
                      </p>
                      <p className="tactical-phosphor text-[9px] font-bold uppercase tracking-wider text-cyan-400">
                        SERIAL_ID #{item.tokenId}
                      </p>
                      <p className="text-[9px] text-cyan-300/70">
                        {isEs ? "Titular" : "Holder"}{" "}
                        <span className="font-mono text-cyan-200/80">{item.ownerTruncated}</span>
                      </p>
                      {item.collectionId != null && item.collectionId > 0 && (
                        <div className="mt-auto pt-2">
                          <Link
                            href={`/chamber?collection=${item.collectionId}`}
                            className={cn(
                              navLink,
                              "w-full justify-center border-cyan-500/40 text-[9px]",
                            )}
                          >
                            {isEs ? "Abrir Chamber" : "Open Chamber"}
                          </Link>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={cn(navLink, "disabled:cursor-not-allowed disabled:opacity-40")}
                  >
                    ← {isEs ? "Ant." : "Prev"}
                  </button>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400/80">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={cn(navLink, "disabled:cursor-not-allowed disabled:opacity-40")}
                  >
                    {isEs ? "Sig." : "Next"} →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E " && node_modules/.bin/tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Add Explore link to navigation in Dashboard and Chamber**

In `app/dashboard/page.tsx`, find the header nav links block and add:

```tsx
<Link href="/explore" className={navLinkClass}>
  {lang === "es" ? "Explorar" : "Explore"}
</Link>
```

In `components/fusion-chamber.tsx`, find the header nav links block and add the same pattern using `chamberNavLink` class:

```tsx
<Link href="/explore" className={chamberNavLink} onClick={() => playTacticalUiClick()}>
  {ch.explore ?? (lang === "es" ? "Explorar" : "Explore")}
</Link>
```

- [ ] **Step 4: Commit**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E " && git add app/explore/page.tsx app/dashboard/page.tsx components/fusion-chamber.tsx && git commit -m "feat(explore): community NFT gallery page with watermarked grid + pagination"
```

---

## Task 4: README Rewrite

**Files:**
- Modify: `README.md` (full replacement)

- [ ] **Step 1: Replace README.md with this content**

```markdown
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
| NFT standard | SEP-50 draft (token_uri, token_metadata, owner_of) |
| Token indexing | [Mercury Classic](https://mercurydata.app) |
| IPFS | Pinata (pinning) + multi-gateway client fallback |
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
```

- [ ] **Step 2: Commit**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E " && git add README.md && git commit -m "docs(readme): professional rewrite — architecture, Mercury, no local setup"
```

---

## Self-Review

**Spec coverage:**
- ✅ Explore page: `/explore` with watermarked grid + pagination
- ✅ Legibility: font-smoothing added to body
- ✅ README: professional, Mercury as architecture section, no local setup, no credits section

**Placeholder scan:** None found — all steps contain exact code or exact commands.

**Type consistency:**
- `ExploreItem` defined in `app/api/explore/route.ts` and imported by `app/explore/page.tsx` ✅
- `PhaseProtectedPreview` props match existing component signature ✅
- `fetchPhaseProtocolTotalSupply`, `fetchTokenOwnerAddress`, `buildPhaseTokenMetadataJson` all exported from their respective modules ✅
