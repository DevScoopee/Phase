import { NextRequest } from "next/server"
import { DEFAULT_PROFILE_LOCALE, getProfile, isProfilePinningRedundancyEnabled, localizeAvatarName, normalizeProfileLocale, resolveAvatarWithFallback, isNftGridVirtualizationEnabled, BatchAvatarQuerySchema, getAvatarsForWallets } from "@/lib/profile-store"
import { StrKey } from "@stellar/stellar-sdk"
import { createApiRequestContext } from "@/lib/api-observability"
import { z } from "zod"

export const dynamic = "force-dynamic"

// ??? phase-117: multi-gateway redundancy ????????????????????????????????????
// Single gateway outage previously dropped metadata. When flag enabled, avatar
// reads use gateway rotation + checksum verification; pins require quorum.

const AvatarQuerySchema = z.object({
  wallet: z.string().trim().min(10).max(56),
})

export async function GET(request: NextRequest) {
  const api = createApiRequestContext(request, "/api/profile/avatar")

  // phase-157 (Module #57): batch avatar fetch for a virtualized grid window.
  // `?wallets=G...,G...` returns many avatars in one round-trip so a 10k-token
  // grid does not fan out thousands of requests. No-op unless the flag is on.
  const rawWallets = request.nextUrl.searchParams.get("wallets")
  if (rawWallets) {
    if (!isNftGridVirtualizationEnabled()) {
      return api.json(
        { error: "Batch avatar fetch disabled (phase-157 flag off)" },
        { status: 404, event: "profile.avatar.batch_disabled" },
      )
    }
    const parsedBatch = BatchAvatarQuerySchema.safeParse({
      wallets: rawWallets.split(",").map((w) => w.trim()).filter(Boolean),
    })
    if (!parsedBatch.success) {
      return api.json(
        { error: "Invalid wallets list", details: parsedBatch.error.flatten() },
        { status: 400, event: "profile.avatar.batch_validation_failed" },
      )
    }
    try {
      const avatars = await getAvatarsForWallets(parsedBatch.data.wallets)
      return api.json(
        { avatars },
        {
          event: "profile.avatar.batch_loaded",
          metadata: { count: avatars.length },
          headers: { "Cache-Control": "private, max-age=30", "X-Phase157": "enabled" },
        },
      )
    } catch (error) {
      return api.errorJson(error, 500, "profile.avatar.batch_failed")
    }
  }

  const rawWallet = request.nextUrl.searchParams.get("wallet")?.trim() ?? ""
  const parsedQ = AvatarQuerySchema.safeParse({ wallet: rawWallet })
  const wallet = parsedQ.success ? parsedQ.data.wallet : rawWallet

  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return api.json(
      { avatar: null },
      { status: 400, event: "profile.avatar.validation_failed", metadata: { reason: "wallet" } },
    )
  }

  try {
    const profile = await getProfile(wallet)

    if (!profile?.avatar_token_id) {
      return api.json({ avatar: null }, { event: "profile.avatar.empty", metadata: { wallet } })
    }

    const preferredLocale = normalizeProfileLocale(profile.locale) ?? DEFAULT_PROFILE_LOCALE

    // phase-117: when enabled, rewrite image URL through verified gateway fallback
    let imageOut = profile.avatar_image_url ?? ""
    let gatewayMeta: string | null = null
    if (isProfilePinningRedundancyEnabled() && imageOut) {
      try {
        const resolved = await resolveAvatarWithFallback(imageOut)
        if (resolved.ok) {
          imageOut = resolved.url
          gatewayMeta = resolved.gateway
        }
      } catch {
        // fall back to original URL (zero regression)
      }
    }

    return api.json(
      {
        avatar: {
          tokenId: profile.avatar_token_id,
          image: imageOut,
          name: localizeAvatarName(profile.avatar_token_id, preferredLocale),
          locale: preferredLocale,
        },
        ...(isProfilePinningRedundancyEnabled()
          ? { redundancy: { enabled: true, gateway: gatewayMeta ?? "legacy" } }
          : {}),
      },
      {
        event: "profile.avatar.loaded",
        metadata: {
          wallet,
          token_id: profile.avatar_token_id,
          ...(gatewayMeta ? { gateway: gatewayMeta } : {}),
          phase117: isProfilePinningRedundancyEnabled(),
          locale: preferredLocale,
        },
        headers: {
          "Cache-Control": "private, max-age=30",
          "X-Phase-Locale": preferredLocale,
          ...(isProfilePinningRedundancyEnabled() ? { "X-Phase117": "enabled", ...(gatewayMeta ? { "X-Phase-Gateway": gatewayMeta } : {}) } : {}),
          ...(isNftGridVirtualizationEnabled() ? { "X-Phase157": "enabled" } : {}),
        },
      },
    )
  } catch (error) {
    return api.errorJson(error, 500, "profile.avatar.load_failed")
  }
}

// POST ? pin avatar with redundancy (phase-117 gated)
// Preserves existing GET; adds opt-in pin path for clients that want quorum
export async function POST(request: NextRequest) {
  const api = createApiRequestContext(request, "/api/profile/avatar")
  if (!isProfilePinningRedundancyEnabled()) {
    return api.json({ error: "Multi-gateway pinning disabled (phase-117 flag off)" }, { status: 404, event: "profile.avatar.redundancy_disabled" })
  }
  let body: { wallet?: unknown; imageUrl?: unknown; imageBlob?: unknown; quorum?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return api.json({ error: "Invalid JSON" }, { status: 400, event: "profile.avatar.invalid_json" })
  }
  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : ""
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return api.json({ error: "Invalid wallet" }, { status: 400, event: "profile.avatar.validation_failed" })
  }
  // For this route we accept imageUrl and fetch server-side for pinning (signing boundary preserved)
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : ""
  if (!imageUrl) return api.json({ error: "imageUrl required" }, { status: 400, event: "profile.avatar.validation_failed" })
  const quorum = typeof body.quorum === "number" && Number.isFinite(body.quorum) ? Math.max(1, Math.min(3, Math.trunc(body.quorum))) : 1

  try {
    // fetch image bytes server-side (with timeout)
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) })
    if (!imgRes.ok) return api.json({ error: `Failed to fetch image (${imgRes.status})` }, { status: 502, event: "profile.avatar.fetch_failed" })
    const ab = await imgRes.arrayBuffer()
    const blob = new Blob([ab], { type: imgRes.headers.get("content-type") ?? "image/png" })

    const { pinAvatarWithRedundancy } = await import("@/lib/profile-store")
    const result = await pinAvatarWithRedundancy(blob, { quorum, fileName: `avatar-${wallet.slice(0, 6)}.png` })
    if (!result.ok) {
      return api.json({ error: result.error, code: result.code, quorum: result.quorum, achieved: result.achieved }, { status: 502, event: "profile.avatar.pin_failed" })
    }
    // Persist new avatar_image_url as verified gateway URL
    const profile = await getProfile(wallet)
    if (profile) {
      const { saveProfile } = await import("@/lib/profile-store")
      await saveProfile(wallet, { ...profile, avatar_image_url: result.uri })
    }
    return api.json(
      { ok: true, cid: result.cid, uri: result.uri, checksum: result.checksum, quorum: result.quorum, achieved: result.achieved },
      { event: "profile.avatar.pinned", metadata: { wallet, cid: result.cid } },
    )
  } catch (error) {
    return api.errorJson(error, 500, "profile.avatar.pin_failed")
  }
}