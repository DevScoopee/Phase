/**
 * SPIKE: lore versioning with word-level diffing — phase-106
 *
 * Proof-of-concept only, scoped to this SPIKE's acceptance criteria. Today
 * `saveNarrativeForToken` overwrites the prior narrative with no history —
 * edits to a token's lore are destructive. This module adds an additive
 * version-history sidecar and a lightweight word-level diff so authors can
 * see what changed between two narrative versions.
 *
 * "Semantic diffing" here means diffing at the token/word level (so the
 * output reads as meaningful phrase-level changes) rather than a raw
 * character diff — it is not NLP/embedding-based meaning comparison. A
 * fuller semantic-embedding diff would need its own design doc and is out
 * of scope for this spike.
 *
 * Feature flag: phase-106 (NEXT_PUBLIC_FEATURE_PHASE_106 / FEATURE_PHASE_106)
 * Rollback: disable flag → version recording stops (no-op); existing version
 *           history files remain on disk untouched; narrator route unaffected.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { serverDataJsonPath } from "@/lib/server-data-paths"
import { isFeatureEnabled } from "@/lib/feature-flags"

export type LoreVersionEntry = {
  version: number
  narrative: string
  lore_input: string
  recorded_at: number
}

type LoreVersionsStore = Record<string, LoreVersionEntry[]>

export function isLoreVersioningEnabled(): boolean {
  return isFeatureEnabled("phase-106")
}

async function readStore(): Promise<LoreVersionsStore> {
  try {
    const raw = await readFile(serverDataJsonPath("loreVersions"), "utf8")
    return JSON.parse(raw) as LoreVersionsStore
  } catch {
    return {}
  }
}

async function writeStore(store: LoreVersionsStore): Promise<void> {
  const filePath = serverDataJsonPath("loreVersions")
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8")
}

/** Appends a new version for a token's narrative. No-op (returns null) when the flag is off. */
export async function recordLoreVersion(
  tokenId: number,
  data: { narrative: string; lore_input: string },
): Promise<LoreVersionEntry | null> {
  if (!isLoreVersioningEnabled()) return null
  const store = await readStore()
  const key = String(tokenId)
  const existing = store[key] ?? []
  const entry: LoreVersionEntry = {
    version: existing.length + 1,
    narrative: data.narrative,
    lore_input: data.lore_input,
    recorded_at: Date.now(),
  }
  store[key] = [...existing, entry]
  await writeStore(store)
  return entry
}

export async function getLoreVersions(tokenId: number): Promise<LoreVersionEntry[]> {
  const store = await readStore()
  return store[String(tokenId)] ?? []
}

export type WordDiffOp = { op: "equal" | "add" | "remove"; words: string[] }

/**
 * Word-level diff between two narrative strings (LCS-based). PoC-grade
 * "semantic diffing": operates on word tokens rather than characters so the
 * output reads as meaningful phrase-level changes.
 */
export function diffNarrativeText(from: string, to: string): WordDiffOp[] {
  const a = from.split(/\s+/).filter(Boolean)
  const b = to.split(/\s+/).filter(Boolean)
  const n = a.length
  const m = b.length

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const ops: WordDiffOp[] = []
  const pushWord = (op: WordDiffOp["op"], word: string) => {
    const last = ops[ops.length - 1]
    if (last && last.op === op) last.words.push(word)
    else ops.push({ op, words: [word] })
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pushWord("equal", a[i]!)
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      pushWord("remove", a[i]!)
      i++
    } else {
      pushWord("add", b[j]!)
      j++
    }
  }
  while (i < n) pushWord("remove", a[i++]!)
  while (j < m) pushWord("add", b[j++]!)

  return ops
}

/** Diffs two recorded versions for a token. Returns null if either version is missing. */
export async function diffLoreVersions(
  tokenId: number,
  fromVersion: number,
  toVersion: number,
): Promise<{ from: LoreVersionEntry; to: LoreVersionEntry; diff: WordDiffOp[] } | null> {
  const versions = await getLoreVersions(tokenId)
  const from = versions.find((v) => v.version === fromVersion)
  const to = versions.find((v) => v.version === toVersion)
  if (!from || !to) return null
  return { from, to, diff: diffNarrativeText(from.narrative, to.narrative) }
}
