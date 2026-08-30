"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useWallet } from "@/components/wallet-provider"
import type { FollowSuggestion } from "@/lib/follow-store"

type Props = {
  targetWallet: string
}

export function FollowSuggestions({ profileWallet }: { profileWallet: string }) {
  const { address } = useWallet()
  const [suggestions, setSuggestions] = useState<FollowSuggestion[]>([])

  useEffect(() => {
    if (!address || address !== profileWallet) return
    const controller = new AbortController()
    fetch(`/api/profile/follow?mode=suggestions&wallet=${encodeURIComponent(address)}&limit=6`, {
      signal: controller.signal,
    })
      .then(async (response) => response.ok
        ? response.json() as Promise<{ suggestions?: FollowSuggestion[] }>
        : { suggestions: [] })
      .then((data) => setSuggestions(data.suggestions ?? []))
      .catch(() => {})
    return () => controller.abort()
  }, [address, profileWallet])

  if (!address || address !== profileWallet || suggestions.length === 0) return null

  return (
    <section aria-labelledby="follow-suggestions-title" className="space-y-3">
      <div className="flex items-baseline justify-between border-b border-violet-800/20 pb-1">
        <h2 id="follow-suggestions-title" className="text-[9px] uppercase tracking-widest text-zinc-500">
          PEOPLE_TO_FOLLOW
        </h2>
        <span className="text-[8px] text-zinc-600">STELLAR GRAPH</span>
      </div>
      <div className="divide-y divide-violet-800/20 border-y border-violet-800/20">
        {suggestions.map((suggestion) => (
          <Link
            key={suggestion.wallet}
            href={`/profile/${suggestion.wallet}`}
            className="flex items-center gap-3 py-2.5 text-[10px] transition-colors hover:text-violet-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-zinc-300">{suggestion.displayName ?? `${suggestion.wallet.slice(0, 6)}…${suggestion.wallet.slice(-4)}`}</span>
              {suggestion.displayName && <span className="block truncate text-[8px] text-zinc-600">{suggestion.wallet}</span>}
            </span>
            <span className="shrink-0 text-[8px] text-zinc-500">
              {suggestion.mutualFollows > 0 ? `${suggestion.mutualFollows} mutual` : `${suggestion.sharedAssets} shared assets`}
            </span>
            <span aria-hidden="true" className="text-violet-500">→</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function FollowButton({ targetWallet }: Props) {
  const { address } = useWallet()
  const [following, setFollowing] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address || address === targetWallet) return
    fetch(`/api/profile/follow?wallet=${encodeURIComponent(targetWallet)}&viewer=${encodeURIComponent(address)}`)
      .then((r) => r.json() as Promise<{ isFollowing?: boolean | null }>)
      .then((data) => setFollowing(data.isFollowing ?? false))
      .catch(() => {})
  }, [address, targetWallet])

  if (!address || address === targetWallet) return null

  async function toggle() {
    if (!address || busy) return
    setBusy(true)
    setError(null)
    const action = following ? "unfollow" : "follow"
    try {
      const res = await fetch("/api/profile/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: address, to: targetWallet, action }),
      })
      if (res.ok) {
        setFollowing(!following)
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? "Follow request failed")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy || following === null}
        onClick={() => void toggle()}
        className={`shrink-0 font-mono text-[10px] uppercase tracking-widest px-4 py-1.5 border transition-colors disabled:opacity-40 ${
          following
            ? "border-violet-700/40 text-violet-500 hover:border-red-500/40 hover:text-red-400"
            : "border-[#534AB7] bg-[#534AB7]/10 text-[#7F77DD] hover:bg-[#534AB7]/20"
        }`}
      >
        {following === null
          ? "···"
          : following
          ? "[ FOLLOWING ]"
          : "[ FOLLOW ]"}
      </button>
      {error && (
        <span className="max-w-48 text-right font-mono text-[9px] uppercase tracking-wider text-red-400">
          {error}
        </span>
      )}
    </span>
  )
}
