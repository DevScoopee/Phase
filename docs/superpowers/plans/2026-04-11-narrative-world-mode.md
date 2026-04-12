# Narrative World Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional "narrative world" mode to PHASE collections: creators set a `world_name` + `world_prompt`; an async Gemini narrator generates per-NFT story connections; all stored off-chain in JSON sidecars with zero impact on existing x402 / settle / contract flows.

**Architecture:** Two JSON sidecars (`worldCollections.json`, `worldNarratives.json`) following the existing `serverDataJsonPath` pattern. World config is saved after collection creation. The narrator is triggered lazily from the chamber page on first load — this sidesteps the token_id timing problem (collection is created after forge-agent runs). Forge-agent injects the world_prompt of the creator's current collection into Gemini's system instruction, enabling world-aware lore on subsequent forges.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@google/generative-ai` (already installed), Node `fs/promises` (already used in faucet/artist-profile routes)

---

## File Map

### New files
| Path | Purpose |
|---|---|
| `lib/narrative-world-store.ts` | Read/write helpers for both JSON sidecars |
| `app/api/world/route.ts` | `POST` — save world config for a collection |
| `app/api/world/[collection_id]/route.ts` | `GET` — fetch world config for a collection |
| `app/api/world/narrative/[token_id]/route.ts` | `GET` — fetch saved narrative for a token |
| `app/api/narrator/route.ts` | `POST` — generate narrative via Gemini + save |

### Modified files
| Path | Change |
|---|---|
| `lib/server-data-paths.ts` | Add `worldCollections` and `worldNarratives` keys |
| `app/api/forge-agent/route.ts` | Accept `collection_id` in body; prepend world_prompt to system instruction |
| `app/forge/page.tsx` | World toggle + fields; save world after collection creation; pass `collection_id` to forge-agent |
| `components/fusion-chamber.tsx` | Fetch world + narrative; trigger narrator if active + no narrative; display section |
| `app/api/explore/route.ts` | Add `worldName?: string` to `ExploreItem`; read from sidecar |
| `app/explore/page.tsx` | "Solo mundos narrativos" filter toggle; world badge on items |

---

## Task 1 — Storage layer

**Files:**
- Modify: `lib/server-data-paths.ts`
- Create: `lib/narrative-world-store.ts`

- [ ] **Step 1: Add sidecar keys to server-data-paths.ts**

Open `lib/server-data-paths.ts`. The `FILES` const currently has `nftListings`, `faucetClaims`, `classicLiqClaims`, `artistProfiles`. Add two new keys:

```typescript
const FILES = {
  nftListings: "nft-listings.json",
  faucetClaims: "faucet-claims.json",
  classicLiqClaims: "classic-liq-claims.json",
  artistProfiles: "artist-profiles.json",
  worldCollections: "world-collections.json",
  worldNarratives: "world-narratives.json",
} as const
```

- [ ] **Step 2: Create lib/narrative-world-store.ts**

```typescript
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { serverDataJsonPath } from "@/lib/server-data-paths"

export type WorldCollectionData = {
  world_name: string
  world_prompt: string
  created_at: number
}

export type WorldNarrativeData = {
  narrative: string
  collection_id: number
  lore_input: string
  generated_at: number
}

type WorldCollectionsStore = Record<string, WorldCollectionData>
type WorldNarrativesStore = Record<string, WorldNarrativeData>

async function readJsonStore<T extends object>(filePath: string): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8")
    return JSON.parse(raw) as T
  } catch {
    return {} as T
  }
}

async function writeJsonStore<T extends object>(filePath: string, data: T): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

export async function getWorldForCollection(collectionId: number): Promise<WorldCollectionData | null> {
  const store = await readJsonStore<WorldCollectionsStore>(
    serverDataJsonPath("worldCollections"),
  )
  return store[String(collectionId)] ?? null
}

export async function saveWorldForCollection(
  collectionId: number,
  data: Pick<WorldCollectionData, "world_name" | "world_prompt">,
): Promise<void> {
  const filePath = serverDataJsonPath("worldCollections")
  const store = await readJsonStore<WorldCollectionsStore>(filePath)
  store[String(collectionId)] = { ...data, created_at: Date.now() }
  await writeJsonStore(filePath, store)
}

export async function getAllWorldCollections(): Promise<WorldCollectionsStore> {
  return readJsonStore<WorldCollectionsStore>(serverDataJsonPath("worldCollections"))
}

export async function getNarrativeForToken(tokenId: number): Promise<WorldNarrativeData | null> {
  const store = await readJsonStore<WorldNarrativesStore>(
    serverDataJsonPath("worldNarratives"),
  )
  return store[String(tokenId)] ?? null
}

export async function saveNarrativeForToken(
  tokenId: number,
  data: Omit<WorldNarrativeData, "generated_at">,
): Promise<void> {
  const filePath = serverDataJsonPath("worldNarratives")
  const store = await readJsonStore<WorldNarrativesStore>(filePath)
  store[String(tokenId)] = { ...data, generated_at: Date.now() }
  await writeJsonStore(filePath, store)
}

/** Returns narratives for a collection sorted newest-first, up to `limit`. */
export async function getRecentNarrativesForCollection(
  collectionId: number,
  limit: number,
): Promise<WorldNarrativeData[]> {
  const store = await readJsonStore<WorldNarrativesStore>(serverDataJsonPath("worldNarratives"))
  return Object.values(store)
    .filter((v) => v.collection_id === collectionId)
    .sort((a, b) => b.generated_at - a.generated_at)
    .slice(0, limit)
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors referencing `server-data-paths.ts` or `narrative-world-store.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/server-data-paths.ts lib/narrative-world-store.ts
git commit -m "feat(world): add narrative world store layer (JSON sidecars)"
```

---

## Task 2 — World data API routes

**Files:**
- Create: `app/api/world/route.ts`
- Create: `app/api/world/[collection_id]/route.ts`
- Create: `app/api/world/narrative/[token_id]/route.ts`

- [ ] **Step 1: Create app/api/world/route.ts**

This is the `POST` endpoint called by the forge page after collection creation to save the world config.

```typescript
import { NextRequest, NextResponse } from "next/server"
import { saveWorldForCollection } from "@/lib/narrative-world-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type WorldSaveBody = {
  collection_id?: unknown
  world_name?: unknown
  world_prompt?: unknown
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

export async function POST(request: NextRequest) {
  let body: WorldSaveBody
  try {
    body = (await request.json()) as WorldSaveBody
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const collectionId = Number(body.collection_id)
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "collection_id debe ser un entero positivo" }, { status: 400 })
  }

  if (!isNonEmptyString(body.world_name) || body.world_name.trim().length > 80) {
    return NextResponse.json(
      { error: "world_name es requerido y debe tener máximo 80 caracteres" },
      { status: 400 },
    )
  }

  if (!isNonEmptyString(body.world_prompt) || body.world_prompt.trim().length > 1000) {
    return NextResponse.json(
      { error: "world_prompt es requerido y debe tener máximo 1000 caracteres" },
      { status: 400 },
    )
  }

  await saveWorldForCollection(collectionId, {
    world_name: body.world_name.trim(),
    world_prompt: body.world_prompt.trim(),
  })

  return NextResponse.json({ ok: true, collection_id: collectionId })
}
```

- [ ] **Step 2: Create app/api/world/[collection_id]/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getWorldForCollection } from "@/lib/narrative-world-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: { collection_id: string } },
) {
  const collectionId = Number(params.collection_id)
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "collection_id inválido" }, { status: 400 })
  }

  const world = await getWorldForCollection(collectionId)
  if (!world) {
    return NextResponse.json({ world: null }, { status: 200 })
  }

  return NextResponse.json({ world })
}
```

- [ ] **Step 3: Create app/api/world/narrative/[token_id]/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getNarrativeForToken } from "@/lib/narrative-world-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: { token_id: string } },
) {
  const tokenId = Number(params.token_id)
  if (!Number.isInteger(tokenId) || tokenId <= 0) {
    return NextResponse.json({ error: "token_id inválido" }, { status: 400 })
  }

  const narrative = await getNarrativeForToken(tokenId)
  return NextResponse.json({ narrative })
}
```

- [ ] **Step 4: Smoke test routes compile**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/world/
git commit -m "feat(world): add world data API routes (save config, fetch world, fetch narrative)"
```

---

## Task 3 — Narrator agent API

**Files:**
- Create: `app/api/narrator/route.ts`

The narrator is called from the chamber page after a successful NFT load where the collection has a world but the token has no narrative yet. It uses the same `@google/generative-ai` client as forge-agent.

- [ ] **Step 1: Create app/api/narrator/route.ts**

```typescript
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai"
import { NextRequest, NextResponse } from "next/server"
import {
  getWorldForCollection,
  getRecentNarrativesForCollection,
  saveNarrativeForToken,
  getNarrativeForToken,
} from "@/lib/narrative-world-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const SAFETY_SETTINGS = (
  [
    HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    HarmCategory.HARM_CATEGORY_HARASSMENT,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
  ] as const
).map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }))

function narratorGeminiApiKey(): string | null {
  const studio = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim().replace(/^["']|["']$/g, "")
  const legacy = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, "")
  const key = studio?.startsWith("AIza") && studio.length >= 35 ? studio : legacy
  return key && key.length >= 35 ? key : null
}

function narratorModelId(): string {
  const fromEnv = process.env.GEMINI_MODEL?.trim().replace(/^models\//i, "").trim()
  if (fromEnv && fromEnv.length > 0) return fromEnv
  return "gemini-2.5-flash"
}

type NarratorBody = {
  token_id?: unknown
  collection_id?: unknown
  lore?: unknown
}

export async function POST(request: NextRequest) {
  let body: NarratorBody
  try {
    body = (await request.json()) as NarratorBody
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const tokenId = Number(body.token_id)
  const collectionId = Number(body.collection_id)

  if (!Number.isInteger(tokenId) || tokenId <= 0) {
    return NextResponse.json({ error: "token_id inválido" }, { status: 400 })
  }
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "collection_id inválido" }, { status: 400 })
  }

  // Idempotent: if narrative already exists, return it without re-generating.
  const existing = await getNarrativeForToken(tokenId)
  if (existing) {
    return NextResponse.json({ ok: true, narrative: existing.narrative, cached: true })
  }

  const world = await getWorldForCollection(collectionId)
  if (!world) {
    return NextResponse.json({ error: "Esta colección no tiene mundo narrativo activo" }, { status: 404 })
  }

  const apiKey = narratorGeminiApiKey()
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_AI_STUDIO_API_KEY no configurada" }, { status: 503 })
  }

  const loreInput = typeof body.lore === "string" ? body.lore.trim() : ""
  const recentNarratives = await getRecentNarrativesForCollection(collectionId, 2)
  const previousContext =
    recentNarratives.length > 0
      ? `\n\nConexiones narrativas anteriores en este mundo:\n${recentNarratives.map((n, i) => `${i + 1}. ${n.narrative}`).join("\n")}`
      : ""

  const systemPrompt =
    `Eres el Narrador del mundo "${world.world_name}". ` +
    `Contexto del mundo: ${world.world_prompt}` +
    previousContext +
    `\n\nUn nuevo artefacto acaba de ser forjado en este mundo` +
    (loreInput ? `: "${loreInput}"` : ".") +
    ` Escribe exactamente 2-3 oraciones que conecten este artefacto con el mundo narrativo. ` +
    `Tono: enigmático, literario, coherente con el lore del mundo. Sin encabezados ni markdown.`

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel(
    {
      model: narratorModelId(),
      safetySettings: SAFETY_SETTINGS,
    },
    { apiVersion: "v1beta" },
  )

  let narrative: string
  try {
    const result = await model.generateContent(systemPrompt)
    narrative = result.response.text().trim()
    if (!narrative) {
      return NextResponse.json({ error: "Gemini no devolvió texto" }, { status: 500 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[narrator] Gemini failed", { tokenId, collectionId, msg })
    return NextResponse.json({ error: `Gemini error: ${msg}` }, { status: 500 })
  }

  await saveNarrativeForToken(tokenId, {
    narrative,
    collection_id: collectionId,
    lore_input: loreInput,
  })

  return NextResponse.json({ ok: true, narrative })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/narrator/route.ts
git commit -m "feat(world): add narrator API — async Gemini world narrative generation"
```

---

## Task 4 — Forge-agent world context injection

**Files:**
- Modify: `app/api/forge-agent/route.ts`

The forge-agent accepts an optional `collection_id` in the POST body. If the collection has a `world_prompt`, it is prepended to the system instruction before calling Gemini. Everything else in the route is untouched.

- [ ] **Step 1: Add `collection_id` to `ForgeAgentBody` type**

Find the `ForgeAgentBody` type (around line 75). Change:

```typescript
type ForgeAgentBody = {
  prompt?: string
  settlementTxHash?: string
  payerAddress?: string
  imageStyleMode?: ForgeImageStyleMode | string
}
```

To:

```typescript
type ForgeAgentBody = {
  prompt?: string
  settlementTxHash?: string
  payerAddress?: string
  imageStyleMode?: ForgeImageStyleMode | string
  collection_id?: number
}
```

- [ ] **Step 2: Add `worldPrompt` parameter to `runForgeAgentCore`**

Find `runForgeAgentCore` signature (around line 752):

```typescript
async function runForgeAgentCore(
  userPrompt: string,
  styleMode: ForgeImageStyleMode,
  nanobananaCallBackUrl: string,
): Promise<ForgeAgentSuccessResponse> {
```

Change to:

```typescript
async function runForgeAgentCore(
  userPrompt: string,
  styleMode: ForgeImageStyleMode,
  nanobananaCallBackUrl: string,
  worldPrompt?: string,
): Promise<ForgeAgentSuccessResponse> {
```

- [ ] **Step 3: Inject world prompt into system instruction**

Find the `systemInstruction` assignment inside `runForgeAgentCore` (around line 769):

```typescript
  const systemInstruction =
    styleMode === "cyber"
      ? `Eres el Arquitecto del Protocolo PHASE. Escribe una descripción de máximo 2 oraciones técnicas, oscuras, ciberpunk y enigmáticas sobre el siguiente artefacto forjado por el usuario: ${trimmed}`
      : `Eres el Arquitecto del Protocolo PHASE. Escribe una descripción breve (máximo 2 oraciones) alineada a la idea exacta del usuario, sin imponer estética cyber por defecto: ${trimmed}`
```

Change to:

```typescript
  const worldContext = worldPrompt ? `Contexto del mundo narrativo: ${worldPrompt}\n\n` : ""
  const systemInstruction =
    styleMode === "cyber"
      ? `${worldContext}Eres el Arquitecto del Protocolo PHASE. Escribe una descripción de máximo 2 oraciones técnicas, oscuras, ciberpunk y enigmáticas sobre el siguiente artefacto forjado por el usuario: ${trimmed}`
      : `${worldContext}Eres el Arquitecto del Protocolo PHASE. Escribe una descripción breve (máximo 2 oraciones) alineada a la idea exacta del usuario, sin imponer estética cyber por defecto: ${trimmed}`
```

- [ ] **Step 4: Fetch world prompt in POST handler and pass to runForgeAgentCore**

Find the `try` block in `POST` that calls `runForgeAgentCore` (around line 937):

```typescript
  try {
    const nanobananaCallBackUrl =
      process.env.NANOBANANA_CALLBACK_URL?.trim() ||
      `${request.nextUrl.origin}/api/webhooks/nanobanana`
    const styleMode = normalizeForgeImageStyleMode(body.imageStyleMode)
    const payload = await runForgeAgentCore(body.prompt, styleMode, nanobananaCallBackUrl)
    return NextResponse.json(payload)
```

Change to:

```typescript
  try {
    const nanobananaCallBackUrl =
      process.env.NANOBANANA_CALLBACK_URL?.trim() ||
      `${request.nextUrl.origin}/api/webhooks/nanobanana`
    const styleMode = normalizeForgeImageStyleMode(body.imageStyleMode)

    let worldPrompt: string | undefined
    const collectionId = body.collection_id
    if (typeof collectionId === "number" && collectionId > 0) {
      try {
        const { getWorldForCollection } = await import("@/lib/narrative-world-store")
        const world = await getWorldForCollection(collectionId)
        if (world?.world_prompt) worldPrompt = world.world_prompt
      } catch (e) {
        console.warn("[forge-agent] Could not read world prompt for collection", collectionId, e)
      }
    }

    const payload = await runForgeAgentCore(body.prompt, styleMode, nanobananaCallBackUrl, worldPrompt)
    return NextResponse.json(payload)
```

> **Note on dynamic import:** `narrative-world-store` uses `node:fs/promises` which is fine at runtime. The dynamic import ensures no build-time side effects. If your bundler handles static imports in route files correctly, a static import at the top of the file also works — just add `import { getWorldForCollection } from "@/lib/narrative-world-store"` at the top and replace the dynamic import block with a direct call.

- [ ] **Step 5: Verify TypeScript**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/forge-agent/route.ts
git commit -m "feat(world): inject world_prompt into Gemini system instruction when collection has world"
```

---

## Task 5 — Forge UI: world toggle + save world data

**Files:**
- Modify: `app/forge/page.tsx`

Three changes: (1) add 3 state vars, (2) save world data after collection creation, (3) pass `collection_id` to forge-agent.

- [ ] **Step 1: Add state variables**

Find the state declarations block (around line 230–257). After the existing state declarations, add:

```typescript
  const [worldEnabled, setWorldEnabled] = useState(false)
  const [worldName, setWorldName] = useState("")
  const [worldPrompt, setWorldPrompt] = useState("")
```

- [ ] **Step 2: Save world data after collection creation**

Find the line inside `runCreateCollectionTransaction` where `setCreatedId(id)` is called (around line 500):

```typescript
        const id = ids.length > 0 ? ids[ids.length - 1] : null
        if (id == null) throw new Error(ff.errors.collectionIdRead)
        setCreatedId(id)
```

After `setCreatedId(id)`, add the world data save (fire-and-forget, doesn't block mint):

```typescript
        setCreatedId(id)
        if (worldEnabled && worldName.trim() && worldPrompt.trim()) {
          fetch("/api/world", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              collection_id: id,
              world_name: worldName.trim(),
              world_prompt: worldPrompt.trim(),
            }),
          }).catch((e) => console.warn("[forge] world save failed", e))
        }
```

Also update the `useCallback` dependency array for `runCreateCollectionTransaction` (around line 545). Add `worldEnabled`, `worldName`, `worldPrompt` to the deps:

```typescript
    [address, lang, name, priceLiq, refresh, worldEnabled, worldName, worldPrompt],
```

- [ ] **Step 3: Pass collection_id to forge-agent**

Find the second forge-agent POST body (around line 691):

```typescript
      const secondBody = {
        prompt: userPrompt,
        settlementTxHash: txHash,
        payerAddress,
        imageStyleMode,
      }
```

Change to:

```typescript
      const secondBody = {
        prompt: userPrompt,
        settlementTxHash: txHash,
        payerAddress,
        imageStyleMode,
        ...(collectionId != null && collectionId > 0 ? { collection_id: collectionId } : {}),
      }
```

Update `initiateAgentForge` signature (around line 549) to accept `collectionId`:

```typescript
  const initiateAgentForge = useCallback(
    async (
      userPrompt: string,
      payerAddress: string,
      imageStyleMode: OracleImageStyleMode,
      collectionId?: number | null,
    ): Promise<{ imageUrl: string; lore: string }> => {
```

Update the call site in `handleForgeAgent` (around line 824):

```typescript
      await initiateAgentForge(prompt, addr, oracleImageStyleMode, createdId)
```

- [ ] **Step 4: Add world toggle UI to the collection form**

Find the bottom of the collection form — locate where name, price, and image inputs are rendered. After the last input group in the "register collection" section and before the forge/mint button, add:

```tsx
        {/* ── Narrative World Mode (optional) ── */}
        <div className="mt-4 border border-cyan-400/20 bg-cyan-950/10 p-3">
          <label className="flex cursor-pointer items-center gap-3 select-none">
            <input
              type="checkbox"
              checked={worldEnabled}
              onChange={(e) => setWorldEnabled(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 accent-cyan-400"
            />
            <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">
              Activar mundo narrativo
            </span>
          </label>

          {worldEnabled && (
            <div className="mt-3 space-y-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-cyan-400/70">
                  Nombre del mundo
                </label>
                <input
                  type="text"
                  value={worldName}
                  onChange={(e) => setWorldName(e.target.value)}
                  maxLength={80}
                  placeholder="Ej: Sector Umbral-7"
                  disabled={busy}
                  className="w-full border border-cyan-400/30 bg-transparent px-2 py-1.5 text-[11px] text-cyan-100 placeholder-cyan-700/60 outline-none focus:border-cyan-400/60"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-cyan-400/70">
                  Contexto del mundo (prompt)
                </label>
                <textarea
                  value={worldPrompt}
                  onChange={(e) => setWorldPrompt(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Describe el universo narrativo de esta colección..."
                  disabled={busy}
                  className="w-full resize-none border border-cyan-400/30 bg-transparent px-2 py-1.5 text-[11px] text-cyan-100 placeholder-cyan-700/60 outline-none focus:border-cyan-400/60"
                />
              </div>

              {worldPrompt.trim() && (
                <div className="border border-cyan-400/15 bg-cyan-950/30 p-2">
                  <p className="mb-1 text-[9px] uppercase tracking-widest text-cyan-500">
                    Vista previa — prompt Gemini
                  </p>
                  <p className="text-[10px] italic text-cyan-300/80">
                    {`Contexto del mundo narrativo: ${worldPrompt.trim()}`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/forge/page.tsx
git commit -m "feat(world): forge UI — world toggle, fields, live preview, world save + collection_id to forge-agent"
```

---

## Task 6 — Chamber: narrative display

**Files:**
- Modify: `components/fusion-chamber.tsx`

The chamber already fetches collection info and displays lore. Add: fetch world config, fetch/trigger narrative, display narrative section.

- [ ] **Step 1: Add world + narrative state variables**

Find the state block near the top of the `FusionChamber` component function (after the existing `useState` declarations). Add:

```typescript
  const [worldData, setWorldData] = useState<{
    world_name: string
    world_prompt: string
  } | null>(null)
  const [narrativeData, setNarrativeData] = useState<string | null>(null)
  const [narrativeLoading, setNarrativeLoading] = useState(false)
```

- [ ] **Step 2: Add a `useEffect` that fetches world + narrative after the token loads**

Find where the chamber detects the collection and token info is loaded (look for `useEffect` blocks that depend on `collectionId` or `tokenId`). After the collection info loads and `collectionId` and `tokenId` are known, add a new `useEffect`:

```typescript
  // Fetch world config + narrative for this token (if collection has a world).
  useEffect(() => {
    const cid = collectionId   // number | null — adjust variable name to match your existing state
    const tid = tokenId        // number | null — adjust variable name to match your existing state
    if (!cid || !tid) {
      setWorldData(null)
      setNarrativeData(null)
      return
    }

    let cancelled = false

    async function loadWorldNarrative() {
      // 1. Fetch world config
      let world: { world_name: string; world_prompt: string } | null = null
      try {
        const res = await fetch(`/api/world/${cid}`, { cache: "no-store" })
        if (res.ok) {
          const json = (await res.json()) as { world: typeof world }
          world = json.world
        }
      } catch {
        // no world — silent
      }

      if (cancelled) return
      setWorldData(world)

      if (!world) return

      // 2. Fetch existing narrative
      let existing: string | null = null
      try {
        const res = await fetch(`/api/world/narrative/${tid}`, { cache: "no-store" })
        if (res.ok) {
          const json = (await res.json()) as { narrative: { narrative: string } | null }
          existing = json.narrative?.narrative ?? null
        }
      } catch {
        /* silent */
      }

      if (cancelled) return

      if (existing) {
        setNarrativeData(existing)
        return
      }

      // 3. Generate narrative (lazy, first chamber load for this token)
      setNarrativeLoading(true)
      try {
        const loreText = lore ?? ""   // adjust `lore` to match your existing lore state variable name
        const res = await fetch("/api/narrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token_id: tid, collection_id: cid, lore: loreText }),
        })
        if (res.ok) {
          const json = (await res.json()) as { narrative?: string }
          if (!cancelled && json.narrative) setNarrativeData(json.narrative)
        }
      } catch {
        /* narrator offline — no narrative shown */
      } finally {
        if (!cancelled) setNarrativeLoading(false)
      }
    }

    void loadWorldNarrative()
    return () => { cancelled = true }
  }, [collectionId, tokenId, lore])
```

> **Variable names:** Replace `collectionId`, `tokenId`, and `lore` with the actual state variable names used in `fusion-chamber.tsx`. The component uses `useSearchParams` to get `collection` and loads token state — search for where `collectionId` and `tokenId` state is set in the file.

- [ ] **Step 3: Add narrative display section in the JSX**

Find where the lore/description is displayed in the chamber JSX. After the lore block, add:

```tsx
          {/* ── Narrative World connection (shown only when collection has active world) ── */}
          {worldData && (
            <div className="mt-4 border border-cyan-400/20 bg-cyan-950/15 p-3">
              <p className="mb-1 text-[9px] uppercase tracking-widest text-cyan-500">
                {`[ MUNDO: ${worldData.world_name} ]`}
              </p>
              {narrativeLoading ? (
                <p className="animate-pulse text-[10px] italic text-cyan-400/50">
                  [ NARRADOR: generando conexión... ]
                </p>
              ) : narrativeData ? (
                <p className="text-[11px] leading-relaxed text-cyan-200/80 italic">
                  {narrativeData}
                </p>
              ) : null}
            </div>
          )}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/fusion-chamber.tsx
git commit -m "feat(world): chamber — fetch world + lazy narrator trigger + narrative display"
```

---

## Task 7 — Explore: world filter + badge

**Files:**
- Modify: `app/api/explore/route.ts`
- Modify: `app/explore/page.tsx`

- [ ] **Step 1: Add `worldName` to ExploreItem type in explore API**

In `app/api/explore/route.ts`, find the `ExploreItem` type:

```typescript
export type ExploreItem = {
  tokenId: number
  name: string
  image: string
  collectionId: number | null
  ownerTruncated: string
}
```

Change to:

```typescript
export type ExploreItem = {
  tokenId: number
  name: string
  image: string
  collectionId: number | null
  ownerTruncated: string
  worldName?: string
}
```

- [ ] **Step 2: Load world sidecar once and attach worldName per item**

In the `GET` handler of `app/api/explore/route.ts`, add a `getAllWorldCollections` read before the item mapping. Find the end of the `GET` function where items are built (look for where `ExploreItem` objects are constructed):

At the top of the `GET` function body, after reading `contractId`:

```typescript
  // Read world sidecar once — O(1) per request, not per item.
  const { getAllWorldCollections } = await import("@/lib/narrative-world-store")
  const worldCollections = await getAllWorldCollections().catch(() => ({} as Record<string, { world_name: string }>))
```

Then in the per-item mapping where `ExploreItem` is built, add:

```typescript
      worldName: item.collectionId != null
        ? (worldCollections[String(item.collectionId)]?.world_name ?? undefined)
        : undefined,
```

> The exact location depends on how `mapConcurrent` builds items. Search for where `collectionId` is set on the returned object and add `worldName` alongside it.

- [ ] **Step 3: Add world filter state + filter logic in explore page**

In `app/explore/page.tsx`, add filter state after the existing `useState` declarations:

```typescript
  const [worldOnly, setWorldOnly] = useState(false)
```

Add filtered items derived from data:

```typescript
  const visibleItems = worldOnly
    ? (data?.items ?? []).filter((item) => Boolean(item.worldName))
    : (data?.items ?? [])
```

- [ ] **Step 4: Add filter toggle UI in explore page**

Find where pagination or the grid header is rendered. Before the items grid, add the filter toggle:

```tsx
          <div className="mb-4 flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={worldOnly}
                onChange={(e) => setWorldOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-cyan-400"
              />
              <span className="text-[10px] uppercase tracking-widest text-cyan-400">
                {isEs ? "Solo mundos narrativos" : "Narrative worlds only"}
              </span>
            </label>
          </div>
```

- [ ] **Step 5: Add world badge on items**

Find where each `ExploreItem` is rendered in the grid (look for the `item.name`, `item.image` usage). After the item name or image, add the world badge when `item.worldName` is set:

```tsx
                {item.worldName && (
                  <span className="mt-1 inline-block border border-cyan-400/40 bg-cyan-950/50 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-cyan-400">
                    {item.worldName}
                  </span>
                )}
```

- [ ] **Step 6: Replace `data?.items` usages with `visibleItems`**

Search the explore page JSX for `data?.items` or `data.items` used to render the grid. Replace the array reference with `visibleItems`.

- [ ] **Step 7: Verify TypeScript**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/api/explore/route.ts app/explore/page.tsx
git commit -m "feat(world): explore — worldName on ExploreItem, world filter toggle, world badge"
```

---

## Task 8 — End-to-end smoke test

No new files. Manual verification that all layers connect.

- [ ] **Step 1: Start dev server**

```bash
cd "/Volumes/SSD PAU /GitHub/P H A S E" && npm run dev
```

- [ ] **Step 2: Verify world save API**

```bash
curl -s -X POST http://localhost:3000/api/world \
  -H "Content-Type: application/json" \
  -d '{"collection_id": 1, "world_name": "Test World", "world_prompt": "A dark cyber world."}' | jq .
```

Expected:
```json
{ "ok": true, "collection_id": 1 }
```

- [ ] **Step 3: Verify world read API**

```bash
curl -s http://localhost:3000/api/world/1 | jq .
```

Expected:
```json
{ "world": { "world_name": "Test World", "world_prompt": "A dark cyber world.", "created_at": 1234567890 } }
```

- [ ] **Step 4: Verify narrator API**

```bash
curl -s -X POST http://localhost:3000/api/narrator \
  -H "Content-Type: application/json" \
  -d '{"token_id": 1, "collection_id": 1, "lore": "An ancient relic of forgotten protocol."}' | jq .
```

Expected:
```json
{ "ok": true, "narrative": "..." }
```

- [ ] **Step 5: Verify narrative read**

```bash
curl -s http://localhost:3000/api/world/narrative/1 | jq .
```

Expected:
```json
{ "narrative": { "narrative": "...", "collection_id": 1, ... } }
```

- [ ] **Step 6: Verify narrator idempotency (second call returns cached)**

```bash
curl -s -X POST http://localhost:3000/api/narrator \
  -H "Content-Type: application/json" \
  -d '{"token_id": 1, "collection_id": 1, "lore": "anything"}' | jq .cached
```

Expected: `true`

- [ ] **Step 7: Verify backward compat — collection without world**

```bash
curl -s http://localhost:3000/api/world/99999 | jq .
```

Expected:
```json
{ "world": null }
```

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "feat(world): narrative world mode — complete off-chain implementation"
```

---

## Implementation Notes

**Backward compatibility guarantee:** Every new code path is guarded by a null/undefined check on world data. Collections without a world config return `{ world: null }` and the chamber, explore, and forge-agent all no-op on null. Existing x402, settle, SEP-50, and contract flows are not touched.

**Narrator concurrency:** The narrator is idempotent — if called twice for the same `token_id`, the second call returns the cached narrative without hitting Gemini. Race conditions from double-loads in chamber are safe.

**Vercel/serverless:** JSON sidecars write to `os.tmpdir()` on Vercel (same as faucet-claims). World data persists per-instance only. For production persistence, swap `narrative-world-store.ts` to use a database or KV store — the interface stays identical.

**No faucet changes needed:** The faucet mints PHASELQ tokens, not PHASE NFTs. The narrative world mode only applies to PHASE NFT collections. The chamber lazy-generation approach covers all mint paths including any future mint routes without requiring coordination.
