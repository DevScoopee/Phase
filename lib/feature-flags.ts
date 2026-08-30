/**
 * Feature flags — PHASE rolling delivery.
 *
 * Each flag is opt-in via env. Supports both server and client where needed.
 * Rollback: unset the env var or set to "0"/"false" and restart. No migration to undo.
 *
 * Flags:
 * - phase-88: on-chain follow suggestions
 * - phase-89: scheduled signal broadcast queues
 * - phase-90: community polls as a signal subtype
 * - phase-91: moderator-attributed signal audit log
 * - phase-107: AI story-arc continuity validator across artifacts
 * - phase-111: localized narrative caching per language pack
 * - phase-113: narrative content moderation with takedown flow
 * - phase-114: timeline visualization for world events (achievements)
 * - phase-121: gateway health dashboard with latency scoring
 * - phase-122: off-chain metadata delta storage
 * - phase-123: IPFS timeout fallback chain
 * - phase-124: metadata version migration tool
 * - phase-92: push notifications for replies and mentions
 * - phase-93: profile completeness scoring with on-chain signals
 * - phase-94: verified-artist badge issuance via signed attestation
 * - phase-95: follow-graph export and import portability
 */

export type PhaseFeatureFlag =
  | "phase-92"
  | "phase-93"
  | "phase-94"
  | "phase-95"
  | "phase-107"
  | "phase-111"
  | "phase-113"
  | "phase-114"
  | "phase-116"
  | "phase-117"
  | "phase-119"
  | "phase-120"
  | "phase-121"
  | "phase-122"
  | "phase-123"
  | "phase-124"

const FLAG_ENV_MAP: Record<PhaseFeatureFlag, string[]> = {
  "phase-92": ["NEXT_PUBLIC_FEATURE_PHASE_92", "FEATURE_PHASE_92"],
  "phase-93": ["NEXT_PUBLIC_FEATURE_PHASE_93", "FEATURE_PHASE_93"],
  "phase-94": ["NEXT_PUBLIC_FEATURE_PHASE_94", "FEATURE_PHASE_94"],
  "phase-95": ["NEXT_PUBLIC_FEATURE_PHASE_95", "FEATURE_PHASE_95"],
  "phase-107": ["NEXT_PUBLIC_FEATURE_PHASE_107", "FEATURE_PHASE_107"],
  "phase-111": ["NEXT_PUBLIC_FEATURE_PHASE_111", "FEATURE_PHASE_111"],
  "phase-113": ["NEXT_PUBLIC_FEATURE_PHASE_113", "FEATURE_PHASE_113"],
  "phase-114": ["NEXT_PUBLIC_FEATURE_PHASE_114", "FEATURE_PHASE_114"],
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
  const all: PhaseFeatureFlag[] = ["phase-92", "phase-93", "phase-94", "phase-95", "phase-107", "phase-111", "phase-113", "phase-114", "phase-116", "phase-117", "phase-119", "phase-120", "phase-121", "phase-122", "phase-123", "phase-124"]
  return all.filter(isFeatureEnabled)
}

export function flagRollbackNote(flag: PhaseFeatureFlag): string {
  const keys = FLAG_ENV_MAP[flag].join(" / ")
  return `Rollback ${flag}: unset ${keys} or set to 0/false and restart. No data migration to revert.`
}
