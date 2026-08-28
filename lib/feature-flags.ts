/**
 * Feature flags — PHASE rolling delivery.
 *
 * Each flag is opt-in via env. Supports both server and client where needed.
 * Rollback: unset the env var or set to "0"/"false" and restart. No migration to undo.
 *
 * Flags:
 * - phase-104: two-factor confirmation for high-value profile changes
 * - phase-105: narrative branch divergence conflict detection
 * - phase-106: lore versioning with word-level diffing (spike)
 * - phase-110: narrative search indexed by entity and location
 * - phase-121: gateway health dashboard with latency scoring
 * - phase-122: off-chain metadata delta storage
 * - phase-123: IPFS timeout fallback chain
 * - phase-124: metadata version migration tool
 */

export type PhaseFeatureFlag =
  | "phase-104"
  | "phase-105"
  | "phase-106"
  | "phase-110"
  | "phase-116"
  | "phase-117"
  | "phase-119"
  | "phase-120"
  | "phase-121"
  | "phase-122"
  | "phase-123"
  | "phase-124"

const FLAG_ENV_MAP: Record<PhaseFeatureFlag, string[]> = {
  "phase-104": ["NEXT_PUBLIC_FEATURE_PHASE_104", "FEATURE_PHASE_104"],
  "phase-105": ["NEXT_PUBLIC_FEATURE_PHASE_105", "FEATURE_PHASE_105"],
  "phase-106": ["NEXT_PUBLIC_FEATURE_PHASE_106", "FEATURE_PHASE_106"],
  "phase-110": ["NEXT_PUBLIC_FEATURE_PHASE_110", "FEATURE_PHASE_110"],
  "phase-116": ["NEXT_PUBLIC_FEATURE_PHASE_116", "FEATURE_PHASE_116"],
  "phase-117": ["NEXT_PUBLIC_FEATURE_PHASE_117", "FEATURE_PHASE_117"],
  "phase-119": ["NEXT_PUBLIC_FEATURE_PHASE_119", "FEATURE_PHASE_119"],
  "phase-120": ["NEXT_PUBLIC_FEATURE_PHASE_120", "FEATURE_PHASE_120"],
  "phase-121": ["NEXT_PUBLIC_FEATURE_PHASE_121", "FEATURE_PHASE_121"],
  "phase-122": ["NEXT_PUBLIC_FEATURE_PHASE_122", "FEATURE_PHASE_122"],
  "phase-123": ["NEXT_PUBLIC_FEATURE_PHASE_123", "FEATURE_PHASE_123"],
  "phase-124": ["NEXT_PUBLIC_FEATURE_PHASE_124", "FEATURE_PHASE_124"],
}

function isTruthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === "1" || s === "true" || s === "yes" || s === "on"
}

export function isFeatureEnabled(flag: PhaseFeatureFlag): boolean {
  const keys = FLAG_ENV_MAP[flag]
  for (const k of keys) {
    const v = (typeof process !== "undefined" ? (process.env as Record<string, string | undefined>)[k] : undefined)
    if (isTruthy(v)) return true
  }
  return false
}

export function featureFlagEnvKeys(flag: PhaseFeatureFlag): string[] {
  return [...FLAG_ENV_MAP[flag]]
}

export function getEnabledFeatureFlags(): PhaseFeatureFlag[] {
  const all: PhaseFeatureFlag[] = [
    "phase-104",
    "phase-105",
    "phase-106",
    "phase-110",
    "phase-116",
    "phase-117",
    "phase-119",
    "phase-120",
    "phase-121",
    "phase-122",
    "phase-123",
    "phase-124",
  ]
  return all.filter(isFeatureEnabled)
}

export function flagRollbackNote(flag: PhaseFeatureFlag): string {
  const keys = FLAG_ENV_MAP[flag].join(" / ")
  return `Rollback ${flag}: unset ${keys} or set to 0/false and restart. No data migration to revert.`
}
