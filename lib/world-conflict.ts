/**
 * Narrative branch divergence — conflict detection for co-authored worlds — phase-105
 *
 * `POST /api/world` currently overwrites blindly: if two collaborators edit
 * the same world concurrently, the last write silently wins and the other
 * author's changes are lost ("co-authored worlds overwrite each other
 * blindly"). This module implements the scoped mechanism the issue
 * describes: optimistic concurrency control keyed on a monotonically
 * increasing `version` field on `WorldCollectionData`.
 *
 * This is intentionally narrow — a "detect divergence, surface it to the
 * client" strategy for a single shared resource (a world's name/prompt/tone)
 * — not a general-purpose branch/merge framework.
 *
 * Feature flag: phase-105 (NEXT_PUBLIC_FEATURE_PHASE_105 / FEATURE_PHASE_105)
 * Rollback: disable flag → POST /api/world reverts to unconditional overwrite
 *           (previous behavior). No data migration to revert.
 */
import { isFeatureEnabled } from "@/lib/feature-flags"
import type { WorldCollectionData } from "@/lib/narrative-world-store"

export type WorldConflictResult =
  | { conflict: false }
  | {
      conflict: true
      serverVersion: number
      clientVersion: number
      current: Pick<WorldCollectionData, "world_name" | "world_prompt" | "narrator_tone">
    }

export function isWorldConflictCheckEnabled(): boolean {
  return isFeatureEnabled("phase-105")
}

/**
 * Detects a concurrent-edit conflict between the client's expected version
 * and the currently stored version of a world.
 *
 * - Flag off → never reports a conflict (legacy overwrite behavior).
 * - World doesn't exist yet → nothing to diverge from.
 * - Client omitted `expectedVersion` → opts out of the check (keeps
 *   backward compatibility for older callers).
 */
export function checkWorldConflict(
  existing: WorldCollectionData | null,
  expectedVersion: number | undefined,
): WorldConflictResult {
  if (!isWorldConflictCheckEnabled()) return { conflict: false }
  if (!existing) return { conflict: false }
  if (expectedVersion === undefined) return { conflict: false }

  const serverVersion = existing.version ?? 0
  if (expectedVersion === serverVersion) return { conflict: false }

  return {
    conflict: true,
    serverVersion,
    clientVersion: expectedVersion,
    current: {
      world_name: existing.world_name,
      world_prompt: existing.world_prompt,
      narrator_tone: existing.narrator_tone,
    },
  }
}
