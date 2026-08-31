import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { serverDataJsonPath } from "@/lib/server-data-paths";
import { isFeatureEnabled } from "@/lib/feature-flags";

export type SignalPollOption = {
  id: string;
  text: string;
  voters: string[];
};

export type SignalPoll = {
  options: SignalPollOption[];
  closes_at?: number;
};

export type Signal = {
  id: string;
  author_wallet: string;
  author_display: string;
  channel: "general" | "showcase" | string;
  title: string;
  body: string;
  nft_token_id?: number;
  nft_collection_id?: number;
  nft_name?: string;
  nft_image?: string;
  upvotes: string[];
  created_at: number;
  signature: string;
  type?: "post" | "poll";
  poll?: SignalPoll;
  scheduled_for?: number;
  status?: "scheduled" | "published" | "cancelled";
  taken_down?: boolean;
  takedown_reason?: string;
  taken_down_at?: number;
};

export type SignalReply = {
  id: string;
  signal_id: string;
  author_wallet: string;
  author_display: string;
  body: string;
  upvotes: string[];
  created_at: number;
  signature: string;
};

type SignalsStore = Record<string, Signal>;
type SignalRepliesStore = Record<string, SignalReply>;

async function readJsonStore<T extends object>(filePath: string): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

async function writeJsonStore<T extends object>(
  filePath: string,
  data: T,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

/** hot = upvotes + recency weighted (upvotes * 3 + created_at/1000) */
function hotScore(s: Signal): number {
  return s.upvotes.length * 3 + s.created_at / 1000;
}

export async function getSignals(
  channel?: string,
  sort: "hot" | "new" | "top" = "hot",
): Promise<Signal[]> {
  const store = await readJsonStore<SignalsStore>(
    serverDataJsonPath("signals"),
  );
  let items = Object.values(store);
  const now = Date.now();
  items = items.filter(
    (signal) =>
      signal.status !== "cancelled" &&
      (!signal.scheduled_for || signal.scheduled_for <= now),
  );
  if (isModerationEnabled()) {
    items = items.filter((s) => !s.taken_down);
  }
  if (channel && channel !== "all") {
    items = items.filter((s) => s.channel === channel);
  }
  if (sort === "new") {
    items.sort((a, b) => b.created_at - a.created_at);
  } else if (sort === "top") {
    items.sort((a, b) => b.upvotes.length - a.upvotes.length);
  } else {
    items.sort((a, b) => hotScore(b) - hotScore(a));
  }
  return items;
}

export async function getSignal(id: string): Promise<Signal | null> {
  const store = await readJsonStore<SignalsStore>(
    serverDataJsonPath("signals"),
  );
  return store[id] ?? null;
}

export async function createSignal(
  data: Omit<Signal, "id" | "created_at">,
): Promise<Signal> {
  const filePath = serverDataJsonPath("signals");
  const store = await readJsonStore<SignalsStore>(filePath);
  const now = Date.now();
  const scheduled =
    isFeatureEnabled("phase-89") &&
    data.scheduled_for != null &&
    data.scheduled_for > now;
  const signal: Signal = {
    ...data,
    id: nanoid(10),
    created_at: now,
    ...(scheduled
      ? { status: "scheduled" as const }
      : { status: "published" as const }),
  };
  store[signal.id] = signal;
  await writeJsonStore(filePath, store);
  return signal;
}

export async function getScheduledSignals(wallet: string): Promise<Signal[]> {
  if (!isFeatureEnabled("phase-89")) return [];
  const store = await readJsonStore<SignalsStore>(
    serverDataJsonPath("signals"),
  );
  const now = Date.now();
  return Object.values(store)
    .filter(
      (signal) =>
        signal.author_wallet === wallet &&
        signal.status === "scheduled" &&
        (signal.scheduled_for ?? 0) > now,
    )
    .sort((a, b) => (a.scheduled_for ?? 0) - (b.scheduled_for ?? 0));
}

export async function cancelScheduledSignal(
  id: string,
  wallet: string,
): Promise<Signal> {
  const filePath = serverDataJsonPath("signals");
  const store = await readJsonStore<SignalsStore>(filePath);
  const signal = store[id];
  if (!signal) throw new Error("Signal not found");
  if (signal.author_wallet !== wallet) throw new Error("Not signal owner");
  if (signal.status !== "scheduled") throw new Error("Signal is not scheduled");
  if ((signal.scheduled_for ?? 0) <= Date.now())
    throw new Error("Signal has already published");
  signal.status = "cancelled";
  await writeJsonStore(filePath, store);
  return signal;
}

export async function voteOnPoll(
  signalId: string,
  optionId: string,
  wallet: string,
): Promise<Signal> {
  const filePath = serverDataJsonPath("signals");
  const store = await readJsonStore<SignalsStore>(filePath);
  const signal = store[signalId];
  if (!signal || signal.type !== "poll" || !signal.poll)
    throw new Error("Poll not found");
  if (signal.poll.closes_at && signal.poll.closes_at <= Date.now())
    throw new Error("Poll is closed");
  const selected = signal.poll.options.find((option) => option.id === optionId);
  if (!selected) throw new Error("Poll option not found");
  for (const option of signal.poll.options) {
    option.voters = option.voters.filter((voter) => voter !== wallet);
  }
  selected.voters.push(wallet);
  await writeJsonStore(filePath, store);
  return signal;
}

export async function upvoteSignal(
  id: string,
  wallet: string,
): Promise<Signal> {
  const filePath = serverDataJsonPath("signals");
  const store = await readJsonStore<SignalsStore>(filePath);
  const signal = store[id];
  if (!signal) throw new Error("Signal not found");
  const idx = signal.upvotes.indexOf(wallet);
  if (idx === -1) {
    signal.upvotes.push(wallet);
  } else {
    signal.upvotes.splice(idx, 1);
  }
  await writeJsonStore(filePath, store);
  return signal;
}

export async function getReplies(signal_id: string): Promise<SignalReply[]> {
  const store = await readJsonStore<SignalRepliesStore>(
    serverDataJsonPath("signalReplies"),
  );
  return Object.values(store)
    .filter((r) => r.signal_id === signal_id)
    .sort((a, b) => a.created_at - b.created_at);
}

export async function createReply(
  data: Omit<SignalReply, "id" | "created_at">,
): Promise<SignalReply> {
  const filePath = serverDataJsonPath("signalReplies");
  const store = await readJsonStore<SignalRepliesStore>(filePath);
  const reply: SignalReply = {
    ...data,
    id: nanoid(10),
    created_at: Date.now(),
  };
  store[reply.id] = reply;
  await writeJsonStore(filePath, store);
  return reply;
}

export async function getSignalChannelStats(
  worldNames: Record<string, string>,
): Promise<Array<{ id: string; label: string; count: number }>> {
  const store = await readJsonStore<SignalsStore>(
    serverDataJsonPath("signals"),
  );
  const counts: Record<string, number> = {};
  for (const s of Object.values(store)) {
    counts[s.channel] = (counts[s.channel] ?? 0) + 1;
  }
  const total = Object.values(store).length;

  const channels: Array<{ id: string; label: string; count: number }> = [
    { id: "all", label: "All signals", count: total },
    { id: "showcase", label: "NFT showcase", count: counts["showcase"] ?? 0 },
    { id: "general", label: "General", count: counts["general"] ?? 0 },
  ];
  for (const [id, label] of Object.entries(worldNames)) {
    channels.push({ id, label, count: counts[id] ?? 0 });
  }
  return channels;
}

// ─── phase-113: narrative content moderation with takedown flow ────────────
// Isolated, flag-gated. Abusive lore/signals previously had no removal path.
// When enabled, taken-down signals are excluded from getSignals() listings.
// When flag off, takedown/restore are no-ops on the read path (zero regression).
// Rollback: unset NEXT_PUBLIC_FEATURE_PHASE_113 / FEATURE_PHASE_113.

export function isModerationEnabled(): boolean {
  const v = (
    process.env.NEXT_PUBLIC_FEATURE_PHASE_113 ??
    process.env.FEATURE_PHASE_113 ??
    ""
  )
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Marks a signal as taken down. Hidden from getSignals() listings while phase-113 is enabled. */
export async function takedownSignal(
  id: string,
  reason: string,
): Promise<Signal> {
  const filePath = serverDataJsonPath("signals");
  const store = await readJsonStore<SignalsStore>(filePath);
  const signal = store[id];
  if (!signal) throw new Error("Signal not found");
  signal.taken_down = true;
  signal.takedown_reason = reason;
  signal.taken_down_at = Date.now();
  await writeJsonStore(filePath, store);
  return signal;
}

/** Reinstates a previously taken-down signal (rollback path). */
export async function restoreSignal(id: string): Promise<Signal> {
  const filePath = serverDataJsonPath("signals");
  const store = await readJsonStore<SignalsStore>(filePath);
  const signal = store[id];
  if (!signal) throw new Error("Signal not found");
  signal.taken_down = false;
  signal.takedown_reason = undefined;
  signal.taken_down_at = undefined;
  await writeJsonStore(filePath, store);
  return signal;
}

// ─── phase-116: narrative contributor attribution & credit ledger ───────────
// Isolated, flag-gated. Co-authors now receive on-chain credit via a
// side-car ledger. When flag off, helpers return empty / no-op (zero regression).
// Rollback: unset NEXT_PUBLIC_FEATURE_PHASE_116 / FEATURE_PHASE_116.

export {
  isPhase116Enabled,
  flag116RollbackNote,
  getSignalContributors,
  addSignalContributor,
  removeSignalContributor,
  computeCreditLedger,
  getGlobalCreditStats,
  clearContributorMemoryForTests,
  seedContributorForSignal,
  ContributorRoleSchema,
  ContributorEntrySchema,
  CreditLedgerEntrySchema,
  SignalContributorsSchema,
  AddContributorRequestSchema,
} from "@/lib/contributor-ledger";
export type {
  ContributorEntry,
  CreditLedgerEntry,
  SignalContributors,
  ContributorRole,
  AddContributorRequest,
} from "@/lib/contributor-ledger";

// ─── phase-156 (Module #56): faucet / participation deny-list with governance veto ───
// Isolated, flag-gated. Abusive wallets previously could not be cleanly excluded.
// When enabled, the replies route rejects posts from denied wallets. When flag
// off, isWalletDenied() returns false (zero regression).
// Rollback: unset NEXT_PUBLIC_FEATURE_PHASE_156 / FEATURE_PHASE_156.
export {
  isFaucetDenyListEnabled,
  flag156RollbackNote,
  proposeDenyListEntry,
  castGovernanceVeto,
  liftDenyListEntry,
  isWalletDenied,
  getWalletDenyEntry,
  listDenyList,
  getDenyListEntry,
  deriveDenyStatus,
  governanceSigners,
  isGovernanceSigner,
  clearDenyListForTests,
  FaucetDenyListError,
  AddDenyRequestSchema,
  GovernanceVetoSchema,
  DEFAULT_VETO_QUORUM,
} from "@/lib/faucet-deny-list";
export type {
  DenyListEntry,
  DenyListStatus,
  AddDenyRequest,
  GovernanceVeto,
} from "@/lib/faucet-deny-list";

import { z } from "zod";

export const AttributionInReplySchema = z.object({
  contributors: z
    .array(
      z.object({
        wallet: z
          .string()
          .trim()
          .length(56)
          .regex(/^G[A-Z2-7]{55}$/),
        displayName: z.string().trim().min(1).max(48),
        role: z
          .enum(["author", "co_author", "editor", "illustrator", "translator"])
          .default("co_author"),
        shareBps: z.number().int().min(0).max(10_000).default(1000),
      }),
    )
    .max(5)
    .optional(),
});

export type AttributionInReply = z.infer<typeof AttributionInReplySchema>;

/**
 * Records reply co-authors into the contributor ledger (flag-gated).
 * Best-effort; failures are logged but do not block reply creation.
 */
export async function recordReplyAttribution(
  signalId: string,
  replyAuthorWallet: string,
  attribution: AttributionInReply | null,
): Promise<void> {
  const flagOn = (() => {
    try {
      const v = (
        process.env.NEXT_PUBLIC_FEATURE_PHASE_116 ??
        process.env.FEATURE_PHASE_116 ??
        ""
      )
        .trim()
        .toLowerCase();
      return v === "1" || v === "true" || v === "yes" || v === "on";
    } catch {
      return false;
    }
  })();
  if (!flagOn) return;
  if (!attribution?.contributors || attribution.contributors.length === 0)
    return;
  try {
    const { addSignalContributor } = await import("@/lib/contributor-ledger");
    for (const c of attribution.contributors) {
      try {
        await addSignalContributor(signalId, {
          wallet: c.wallet,
          displayName: c.displayName,
          role: c.role,
          shareBps: c.shareBps,
          addedBy: replyAuthorWallet,
          signature: null,
        });
      } catch {
        // per-contributor errors non-blocking
      }
    }
  } catch {
    // ledger unavailable
  }
}

// ── Issue #104: IPFS Media Attachments (phase-86) ─────────────────────────────

export function isPhase86Enabled(): boolean {
  const v = (
    process.env.NEXT_PUBLIC_FEATURE_PHASE_86 ??
    process.env.FEATURE_PHASE_86 ??
    ""
  )
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export type MediaAttachment = {
  ipfs_cid: string;
  ipfs_url: string;
  media_type: "image" | "video" | "audio";
  thumbnail_cid?: string;
  thumbnail_url?: string;
  file_size?: number;
  width?: number;
  height?: number;
};

export async function addMediaToSignal(
  signalId: string,
  media: MediaAttachment,
): Promise<Signal> {
  if (!isPhase86Enabled()) throw new Error("phase-86 disabled");
  const store = await readJsonStore<SignalsStore>(
    serverDataJsonPath("signals"),
  );
  const signal = store[signalId];
  if (!signal) throw new Error("Signal not found");

  if (!signal.media) {
    signal.media = [];
  }
  signal.media.push(media);

  await writeJsonStore(serverDataJsonPath("signals"), store);
  return signal;
}

export async function addMediaToReply(
  replyId: string,
  media: MediaAttachment,
): Promise<SignalReply> {
  if (!isPhase86Enabled()) throw new Error("phase-86 disabled");
  const store = await readJsonStore<SignalRepliesStore>(
    serverDataJsonPath("signalReplies"),
  );
  const reply = store[replyId];
  if (!reply) throw new Error("Reply not found");

  if (!reply.media) {
    reply.media = [];
  }
  reply.media.push(media);

  await writeJsonStore(serverDataJsonPath("signalReplies"), store);
  return reply;
}

export async function generateThumbnail(
  ipfsCid: string,
  maxWidth: number = 400,
): Promise<{ cid: string; url: string } | null> {
  if (!isPhase86Enabled()) return null;
  // Placeholder implementation - would use image processing library
  // For now, return the original as thumbnail
  return {
    cid: ipfsCid,
    url: `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
  };
}
