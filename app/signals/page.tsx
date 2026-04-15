"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useWallet } from "@/components/wallet-provider"
import { useLang } from "@/components/lang-context"
import { SignalCompose } from "@/components/signal-compose"
import { SocialChips } from "@/components/profile-panel"
import type { Signal } from "@/lib/signal-store"

type ChannelStat = { id: string; label: string; count: number }

const copy = {
  en: {
    title: "◈ SIGNAL_BOARD",
    subtitle: "Community feed for PHASE protocol operators.",
    channels: "CHANNELS",
    all: "All signals",
    showcase: "NFT showcase",
    general: "General",
    worlds: "WORLDS",
    hot: "[ HOT ]",
    top: "[ TOP ]",
    new: "[ NEW ]",
    newPost: "[ NEW_SIGNAL ]",
    loadMore: "[ LOAD_MORE ]",
    loading: "[ LOADING… ]",
    noSignals: "[ NO_SIGNALS ]",
    replies: "replies",
    upvotes: "upvotes",
    walletBadge: "✓ WALLET",
    onChain: "✓ ON-CHAIN",
    unverified: "UNVERIFIED",
    collector: "✓ COLLECTOR",
    share: "↗ share",
    expandMore: "[ more ]",
    expandLess: "[ less ]",
  },
  es: {
    title: "◈ TABLERO_DE_SEÑALES",
    subtitle: "Feed comunitario para operadores del protocolo PHASE.",
    channels: "CANALES",
    all: "Todas las señales",
    showcase: "Vitrina NFT",
    general: "General",
    worlds: "MUNDOS",
    hot: "[ EVOS ]",
    top: "[ TOP ]",
    new: "[ NUEVA_SEÑAL ]",
    newPost: "[ NUEVA_SEÑAL ]",
    loadMore: "[ CARGAR_MÁS ]",
    loading: "[ CARGANDO… ]",
    noSignals: "[ SIN_SEÑALES ]",
    replies: "respuestas",
    upvotes: "votos",
    walletBadge: "✓ WALLET",
    onChain: "✓ ON-CHAIN",
    unverified: "NO_VERIFICADO",
    collector: "✓ COLECCIONISTA",
    share: "↗ compartir",
    expandMore: "[ más ]",
    expandLess: "[ menos ]",
  },
}

function timeAgo(ts: number, lang: string): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (lang === "es") {
    if (d > 0) return `${d}d`
    if (h > 0) return `${h}h`
    return `${m}m`
  }
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  return `${m}m ago`
}

function channelTag(channel: string, channels: ChannelStat[]): string {
  if (channel === "showcase") return "NFT"
  if (channel === "general") return "GENERAL"
  const w = channels.find((c) => c.id === channel)
  return w ? `WORLD: ${w.label.toUpperCase()}` : channel.toUpperCase()
}

type AuthorProfile = {
  twitter?: string
  discord?: string
  telegram?: string
  isCollector: boolean
}

function useAuthorProfile(wallet: string): AuthorProfile {
  const [data, setData] = useState<AuthorProfile>({ isCollector: false })
  useEffect(() => {
    const abortCtrl = new AbortController()
    Promise.allSettled([
      fetch(`/api/profile?wallet=${encodeURIComponent(wallet)}`, { signal: abortCtrl.signal })
        .then((r) => r.json() as Promise<{ profile?: { twitter?: string; discord?: string; telegram?: string } | null }>),
      fetch(`/api/wallet/phase-nfts?address=${encodeURIComponent(wallet)}`, { signal: abortCtrl.signal })
        .then((r) => r.json() as Promise<{ items?: unknown[] }>),
    ]).then(([profileRes, nftRes]) => {
      const profile = profileRes.status === "fulfilled" ? profileRes.value.profile : null
      const nfts = nftRes.status === "fulfilled" ? (nftRes.value.items ?? []) : []
      setData({
        twitter: profile?.twitter,
        discord: profile?.discord,
        telegram: profile?.telegram,
        isCollector: nfts.length > 0,
      })
    }).catch(() => {})
    return () => abortCtrl.abort()
  }, [wallet])
  return data
}

function useNftVerified(wallet: string, tokenId: number | undefined): "pending" | "verified" | "unverified" {
  const [state, setState] = useState<"pending" | "verified" | "unverified">("pending")
  useEffect(() => {
    if (tokenId === undefined) return
    const abortCtrl = new AbortController()
    fetch(`/api/phase-nft/verify?wallet=${encodeURIComponent(wallet)}&tokenId=${tokenId}`, { signal: abortCtrl.signal })
      .then((r) => r.json() as Promise<{ verified?: boolean }>)
      .then((data) => setState(data.verified ? "verified" : "unverified"))
      .catch(() => setState("unverified"))
    return () => abortCtrl.abort()
  }, [wallet, tokenId])
  return state
}

function PostCard({
  signal,
  channels,
  lang,
  t,
  onUpvote,
}: {
  signal: Signal
  channels: ChannelStat[]
  lang: string
  t: typeof copy.en
  onUpvote: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const initials = signal.author_display.slice(0, 2).toUpperCase()
  const shortWallet = `${signal.author_wallet.slice(0, 4)}…${signal.author_wallet.slice(-4)}`
  const isLong = signal.body.length > 180
  const authorProfile = useAuthorProfile(signal.author_wallet)
  const nftVerified = useNftVerified(signal.author_wallet, signal.nft_token_id)

  return (
    <Link
      href={`/signals/${signal.id}`}
      className="block border border-[var(--color-border-tertiary)] hover:border-[var(--color-border-primary)] transition-colors"
      style={{
        background: "var(--color-background-primary)",
        ...(signal.channel !== "general" && signal.channel !== "showcase"
          ? { borderLeft: "2px solid #7F77DD" }
          : {}),
      }}
    >
      <div className="p-4 flex flex-col gap-2.5">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: "#534AB7" }}
          >
            {initials}
          </div>
          {/* Author name → public profile */}
          <Link
            href={`/profile/${signal.author_wallet}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-[11px] text-foreground font-medium hover:text-[#7F77DD] transition-colors"
          >
            {signal.author_display}
          </Link>
          <span
            className="font-mono text-[9px] px-1.5 py-0.5"
            style={{ background: "#EEEDFE", color: "#534AB7" }}
          >
            {t.walletBadge}
          </span>
          {authorProfile.isCollector && (
            <span
              className="font-mono text-[8px] px-1.5 py-0.5"
              style={{ background: "#E1F5EE", color: "#0F6E56" }}
            >
              {t.collector}
            </span>
          )}
          <span className="font-mono text-[9px] text-muted-foreground/60 border border-[var(--color-border-tertiary)] px-1.5 py-0.5 uppercase tracking-widest">
            {channelTag(signal.channel, channels)}
          </span>
          <span className="ml-auto font-mono text-[9px] text-muted-foreground/50">
            {timeAgo(signal.created_at, lang)}
          </span>
        </div>

        {/* Social chips */}
        {(authorProfile.twitter || authorProfile.discord || authorProfile.telegram) && (
          <div onClick={(e) => e.preventDefault()}>
            <SocialChips profile={authorProfile} />
          </div>
        )}

        {/* Title */}
        <p className="font-mono text-[13px] font-medium text-foreground leading-snug">
          {signal.title}
        </p>

        {/* NFT card */}
        {signal.nft_token_id !== undefined && (
          <div
            className="flex items-center gap-3 border border-[var(--color-border-tertiary)] p-2"
            onClick={(e) => e.preventDefault()}
          >
            {signal.nft_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signal.nft_image} alt={signal.nft_name} className="h-8 w-8 object-cover" />
            )}
            <span className="font-mono text-[10px] text-foreground/80">{signal.nft_name}</span>
            {nftVerified === "pending" ? (
              <span className="ml-auto font-mono text-[8px] text-muted-foreground/40">···</span>
            ) : nftVerified === "verified" ? (
              <span
                className="ml-auto font-mono text-[8px] tracking-widest px-1.5 py-0.5"
                style={{ background: "#E1F5EE", color: "#0F6E56" }}
              >
                {t.onChain}
              </span>
            ) : (
              <span
                className="ml-auto font-mono text-[8px] tracking-widest px-1.5 py-0.5 border border-[var(--color-border-tertiary)] text-muted-foreground/50"
              >
                {t.unverified}
              </span>
            )}
          </div>
        )}

        {/* Body */}
        <div className="font-mono text-[11px] text-muted-foreground leading-relaxed">
          {isLong && !expanded ? (
            <>
              {signal.body.slice(0, 180)}…{" "}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setExpanded(true) }}
                className="text-[#7F77DD] hover:underline"
              >
                {t.expandMore}
              </button>
            </>
          ) : (
            <>
              {signal.body}
              {isLong && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setExpanded(false) }}
                  className="ml-1 text-[#7F77DD] hover:underline"
                >
                  {t.expandLess}
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 pt-1">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onUpvote(signal.id) }}
            className="font-mono text-[10px] text-muted-foreground hover:text-[#7F77DD] transition-colors"
          >
            ▲ {signal.upvotes.length} {t.upvotes}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              void navigator.clipboard.writeText(`${window.location.origin}/signals/${signal.id}`)
            }}
            className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {t.share}
          </button>
          <span className="ml-auto font-mono text-[9px] text-muted-foreground/40">{shortWallet}</span>
        </div>
      </div>
    </Link>
  )
}

export default function SignalsPage() {
  const { address } = useWallet()
  const { lang } = useLang()
  const t = copy[lang] ?? copy.en

  const [activeChannel, setActiveChannel] = useState("all")
  const [sort, setSort] = useState<"hot" | "new" | "top">("hot")
  const [channels, setChannels] = useState<ChannelStat[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [composeOpen, setComposeOpen] = useState(false)

  const PAGE = 20

  const fetchSignals = useCallback(
    async (ch: string, s: "hot" | "new" | "top", offset = 0, append = false) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          sort: s,
          limit: String(PAGE),
          offset: String(offset),
        })
        if (ch !== "all") params.set("channel", ch)
        const res = await fetch(`/api/signals?${params.toString()}`)
        const data = (await res.json()) as {
          signals: Signal[]
          total: number
          channels: ChannelStat[]
        }
        if (append) {
          setSignals((prev) => [...prev, ...data.signals])
        } else {
          setSignals(data.signals)
        }
        setTotal(data.total)
        setChannels(data.channels)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void fetchSignals(activeChannel, sort)
  }, [activeChannel, sort, fetchSignals])

  function handleChannelChange(id: string) {
    setActiveChannel(id)
    setSort("hot")
  }

  function handleSortChange(s: "hot" | "new" | "top") {
    setSort(s)
  }

  function handleLoadMore() {
    void fetchSignals(activeChannel, sort, signals.length, true)
  }

  function handleUpvote(id: string) {
    if (!address) return
    void fetch(`/api/signals/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: address, signature: address }),
    })
      .then((r) => r.json())
      .then((data: { signal?: Signal }) => {
        if (data.signal) {
          setSignals((prev) => prev.map((s) => (s.id === id ? data.signal! : s)))
        }
      })
      .catch(() => {})
  }

  const worldChannels = channels.filter(
    (c) => c.id !== "all" && c.id !== "general" && c.id !== "showcase",
  )

  const labelClass =
    "font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60 px-3 py-1.5"
  const channelItemClass = (active: boolean) =>
    `flex items-center justify-between px-3 py-1.5 cursor-pointer font-mono text-[11px] transition-colors ${
      active
        ? "text-[#7F77DD] border-l-2 border-[#7F77DD] bg-[#534AB7]/5"
        : "text-muted-foreground hover:text-foreground border-l-2 border-transparent"
    }`

  const tabClass = (active: boolean) =>
    `font-mono text-[10px] uppercase tracking-widest px-4 py-2 transition-colors cursor-pointer border-b-2 ${
      active
        ? "border-[#7F77DD] text-[#7F77DD]"
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`

  return (
    <div className="min-h-screen" style={{ fontFamily: "var(--font-mono)" }}>
      <div className="mx-auto max-w-5xl px-4 py-16">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="font-mono text-[13px] uppercase tracking-[0.2em] text-[#7F77DD]">
            {t.title}
          </h1>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{t.subtitle}</p>
        </div>

        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="hidden w-[200px] shrink-0 flex-col gap-1 md:flex">
            <div className={labelClass}>{t.channels}</div>
            {channels
              .filter((c) => c.id === "all" || c.id === "general" || c.id === "showcase")
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleChannelChange(c.id)}
                  className={channelItemClass(activeChannel === c.id)}
                >
                  <span>
                    {c.id === "all" ? t.all : c.id === "showcase" ? t.showcase : t.general}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground/40">{c.count}</span>
                </button>
              ))}

            {worldChannels.length > 0 && (
              <>
                <div className="my-1 border-t border-[var(--color-border-tertiary)]" />
                <div className={labelClass}>{t.worlds}</div>
                {worldChannels.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleChannelChange(c.id)}
                    className={channelItemClass(activeChannel === c.id)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: "#7F77DD" }}
                      />
                      <span className="truncate">{c.label}</span>
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground/40">{c.count}</span>
                  </button>
                ))}
              </>
            )}
          </aside>

          {/* Main feed */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center border-b border-[var(--color-border-tertiary)]">
                {(["hot", "new", "top"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSortChange(s)}
                    className={tabClass(sort === s)}
                  >
                    {s === "hot" ? t.hot : s === "new" ? t.new : t.top}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setComposeOpen(true)}
                className="border border-[#534AB7] bg-[#534AB7]/10 px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-[#7F77DD] hover:bg-[#534AB7]/20 transition-colors"
              >
                {t.newPost}
              </button>
            </div>

            {/* Feed */}
            {loading && signals.length === 0 ? (
              <div className="py-8 text-center font-mono text-[11px] text-muted-foreground">
                {t.loading}
              </div>
            ) : signals.length === 0 ? (
              <div className="py-8 text-center font-mono text-[11px] text-muted-foreground">
                {t.noSignals}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {signals.map((s) => (
                  <PostCard
                    key={s.id}
                    signal={s}
                    channels={channels}
                    lang={lang}
                    t={t}
                    onUpvote={handleUpvote}
                  />
                ))}
                {signals.length < total && (
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="mt-2 w-full border border-[var(--color-border-tertiary)] py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:border-[var(--color-border-primary)] hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    {t.loadMore}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <SignalCompose
        open={composeOpen}
        onOpenChange={setComposeOpen}
        channels={channels}
        onCreated={(signal) => {
          setSignals((prev) => [signal, ...prev])
          setTotal((n) => n + 1)
        }}
      />
    </div>
  )
}
