"use client"

import { useState, useEffect } from "react"
import { useWallet } from "@/components/wallet-provider"

type Props = {
  targetWallet: string
}

export function FollowButton({ targetWallet }: Props) {
  const { address } = useWallet()
  const [following, setFollowing] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

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
    const action = following ? "unfollow" : "follow"
    try {
      const res = await fetch("/api/profile/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: address, to: targetWallet, action }),
      })
      if (res.ok) setFollowing(!following)
    } finally {
      setBusy(false)
    }
  }

  return (
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
  )
}
