/**
 * Module #67 — Explore domain isolation.
 *
 * AUDIT NOTE (concurrent execution):
 * The prior api/explore route inline-logic ran parallel metadata fetches with a
 * fixed-concurrency worker pool but mixed concerns (schema, hashing, dedupe,
 * pagination) into a single server file. That made the "messages overwrite each
 * other" behaviour — concurrent fetch results racing on the client and stale
 * snapshots clobbering fresher ones — hard to reason about and to test.
 *
 * This module is the single source of truth for the pure explore domain:
 * type-safe schema validation, truncation, content-hash dedup, bounded
 * concurrency and pagination. It contains ZERO server/network imports so it can
 * be unit-tested in isolation with `npx tsx`.
 */

import { createHash } from "node:crypto"
import { z } from "zod"

export const exploreItemSchema = z.object({
  tokenId: z.number().int().nonnegative(),
  name: z.string(),
  image: z.string(),
  contentHash: z.string().optional(),
  duplicateOfTokenId: z.number().int().nonnegative().optional(),
  collectionId: z.number().int().nullable(),
  ownerTruncated: z.string(),
  worldName: z.string().optional(),
})

export type ExploreItem = z.infer<typeof exploreItemSchema>

export const exploreResponseSchema = z.object({
  items: z.array(exploreItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  perPage: z.number().int().positive(),
  content_hash_dedup_enabled: z.boolean().optional(),
})

export type ExploreResponse = z.infer<typeof exploreResponseSchema>

/**
 * Error raised when an explore payload fails type-safe schema validation.
 * Normalised so the UI can distinguish "invalid data" from "fetch failed".
 */
export class ExploreValidationError extends Error {
  readonly code = "EXPLORE_VALIDATION_ERROR" as const
  readonly issues: z.ZodIssue[]
  constructor(issues: z.ZodIssue[]) {
    super(`Explore response failed schema validation (${issues.length} issue(s))`)
    this.name = "ExploreValidationError"
    this.issues = issues
  }
}

export function parseExploreResponse(raw: unknown): ExploreResponse {
  const parsed = exploreResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ExploreValidationError(parsed.error.issues)
  }
  return parsed.data
}

export function truncateAddress(addr: string): string {
  const t = addr.trim()
  if (t.length < 14) return t
  return `${t.slice(0, 6)}…${t.slice(-4)}`
}

/**
 * Bounded-concurrency map. Runs `fn` over `items` with at most `limit`
 * in-flight promises, preserving input order in the output array.
 *
 * AUDIT: this removes the unbounded `Promise.all(ids.map(...))` hazard that let
 * an arbitrarily large scan fan out thousands of RPC calls simultaneously,
 * which is what caused concurrent responses to clobber each other under load.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (limit <= 0 || items.length === 0) return []
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    for (;;) {
      const idx = cursor++
      if (idx >= items.length) return
      out[idx] = await fn(items[idx]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export function assetContentHash(item: Pick<ExploreItem, "image">): string | null {
  const image = item.image.trim().toLowerCase()
  if (!image) return null
  return createHash("sha256").update(image, "utf8").digest("hex")
}

/**
 * Marks repeated asset images with the first-seen token id. Pure — no feature
 * flag read internally so callers decide whether to activate it (see route).
 */
export function dedupeExploreItems(items: ExploreItem[]): ExploreItem[] {
  const firstByHash = new Map<string, number>()
  return items.map((item) => {
    const contentHash = assetContentHash(item)
    if (!contentHash) return item
    const firstTokenId = firstByHash.get(contentHash)
    if (firstTokenId === undefined) {
      firstByHash.set(contentHash, item.tokenId)
      return { ...item, contentHash }
    }
    return { ...item, contentHash, duplicateOfTokenId: firstTokenId }
  })
}

export function paginateExploreItems<T>(items: readonly T[], page: number, perPage: number): T[] {
  if (perPage <= 0) return []
  const start = (page - 1) * perPage
  return items.slice(Math.max(0, start), Math.max(0, start) + perPage)
}

export function filterWorldOnly(items: ExploreItem[]): ExploreItem[] {
  return items.filter((item) => Boolean(item.worldName))
}
