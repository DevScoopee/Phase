"use client"

import { useState, useEffect, useRef, useCallback } from "react"

type AvatarData = {
  tokenId: number
  image?: string
  name: string
}

function getInitials(wallet: string, displayName?: string): string {
  if (displayName?.trim()) {
    const words = displayName.trim().split(/\s+/)
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
    return displayName.slice(0, 2).toUpperCase()
  }
  return wallet.slice(1, 3).toUpperCase()
}

type WalletAvatarProps = {
  wallet: string
  displayName?: string
  size?: number
  className?: string
}

export function WalletAvatar({
  wallet,
  displayName,
  size = 32,
  className = "",
}: WalletAvatarProps) {
  const [avatar, setAvatar] = useState<AvatarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // IntersectionObserver for lazy loading
  useEffect(() => {
    if (!ref.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "50px" }
    )

    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  // Fetch avatar when visible
  useEffect(() => {
    if (!visible || !wallet) return

    let aborted = false
    setLoading(true)

    fetch(`/api/profile/avatar?wallet=${encodeURIComponent(wallet)}`)
      .then((r) => r.json() as Promise<{ avatar: AvatarData | null }>)
      .then((data) => {
        if (!aborted) setAvatar(data.avatar)
      })
      .catch(() => {
        // Silently fail - will show initials
      })
      .finally(() => {
        if (!aborted) setLoading(false)
      })

    return () => { aborted = true }
  }, [visible, wallet])

  const initials = getInitials(wallet, displayName)
  const hasImage = avatar?.image && avatar.image.length > 0

  // Loading state: pulsing gray circle
  if (loading) {
    return (
      <div
        ref={ref}
        className={`shrink-0 rounded-full bg-zinc-800 animate-pulse ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  // Has NFT image: show circular image
  if (hasImage) {
    return (
      <div
        ref={ref}
        className={`shrink-0 rounded-full overflow-hidden border border-violet-700/40 ${className}`}
        style={{ width: size, height: size }}
        title={avatar?.name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar.image}
          alt={avatar.name}
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  // No NFT: show initials circle
  const fontSize = Math.max(8, Math.floor(size * 0.35))
  return (
    <div
      ref={ref}
      className={`shrink-0 rounded-full flex items-center justify-center font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        background: "#534AB7",
        fontSize: `${fontSize}px`,
      }}
    >
      {initials}
    </div>
  )
}
