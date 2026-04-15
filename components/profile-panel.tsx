"use client"

import { useState, useEffect, useCallback } from "react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useLang } from "@/components/lang-context"

// Social icons (inline SVG)
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.062 3.345-.48.33-.913.49-1.303.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.015 3.333-1.386 4.025-1.627 4.477-1.635z" />
    </svg>
  )
}

export type ProfileSocials = {
  display_name?: string
  twitter?: string
  discord?: string
  telegram?: string
}

type ProfileData = ProfileSocials

function SocialChip({
  bg,
  label,
  href,
  onCopy,
}: {
  bg: string
  label: string
  href?: string
  onCopy?: () => void
}) {
  const chip = (
    <span
      className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-[2px] shrink-0"
      style={{ background: bg, fontSize: "7px", color: "#fff", fontWeight: 700, lineHeight: 1 }}
    >
      {label}
    </span>
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:opacity-80 transition-opacity">
        {chip}
      </a>
    )
  }
  return (
    <button type="button" onClick={onCopy} className="flex items-center gap-1 hover:opacity-80 transition-opacity">
      {chip}
    </button>
  )
}

export function SocialChips({
  profile,
  showLabel = false,
}: {
  profile: ProfileSocials
  showLabel?: boolean
}) {
  const [discordCopied, setDiscordCopied] = useState(false)

  function copyDiscord() {
    if (!profile.discord) return
    void navigator.clipboard.writeText(profile.discord).then(() => {
      setDiscordCopied(true)
      setTimeout(() => setDiscordCopied(false), 2000)
    })
  }

  const hasSocials = profile.twitter || profile.discord || profile.telegram
  if (!hasSocials) return <span className="font-mono text-[9px] text-zinc-700">—</span>

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {profile.twitter && (
        <div className="flex items-center gap-1">
          <SocialChip
            bg="#000"
            label="𝕏"
            href={`https://twitter.com/${profile.twitter.replace(/^@/, "")}`}
          />
          {showLabel && (
            <span className="font-mono text-[9px] text-zinc-500">{profile.twitter}</span>
          )}
        </div>
      )}
      {profile.discord && (
        <div className="flex items-center gap-1">
          <SocialChip
            bg="#5865F2"
            label="DC"
            onCopy={copyDiscord}
          />
          {showLabel && (
            <span className="font-mono text-[9px] text-zinc-500">
              {discordCopied ? "[ COPIED ]" : profile.discord}
            </span>
          )}
        </div>
      )}
      {profile.telegram && (
        <div className="flex items-center gap-1">
          <SocialChip
            bg="#0088cc"
            label="TG"
            href={`https://t.me/${profile.telegram.replace(/^@/, "")}`}
          />
          {showLabel && (
            <span className="font-mono text-[9px] text-zinc-500">{profile.telegram}</span>
          )}
        </div>
      )}
    </div>
  )
}

type NftItem = {
  tokenId: number
  name: string
  image?: string
  collectionId?: number
}

type Tab = "artifacts" | "rewards" | "search"

function truncateAddress(addr: string) {
  if (!addr || addr.length < 14) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function avatarInitials(displayName: string | undefined, address: string): string {
  if (displayName?.trim()) {
    const words = displayName.trim().split(/\s+/)
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
    return displayName.slice(0, 2).toUpperCase()
  }
  return address.slice(1, 3).toUpperCase()
}

type SearchResult = {
  wallet: string
  display_name: string | null
  twitter: string | null
  discord: string | null
  telegram: string | null
  artifact_count: number
}

type SearchCopy = {
  searchPlaceholder: string
  searchInitial: string
  searchNoResults: string
  searchSearching: string
  viewProfile: string
}

function SearchTab({ t }: { t: SearchCopy }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    const timer = setTimeout(() => {
      setSearching(true)
      fetch(`/api/profile/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((data: { results?: SearchResult[] }) => {
          setResults(data.results ?? [])
          setSearched(true)
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="flex flex-col gap-3 pt-1">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.searchPlaceholder}
        className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-[10px] text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-violet-600 transition-colors"
      />
      {searching && (
        <p className="font-mono text-[9px] text-zinc-600">{t.searchSearching}</p>
      )}
      {!searching && query.trim().length < 2 && (
        <p className="font-mono text-[9px] text-zinc-700">{t.searchInitial}</p>
      )}
      {!searching && searched && results.length === 0 && (
        <p className="font-mono text-[9px] text-zinc-600">{t.searchNoResults}</p>
      )}
      {results.map((r) => {
        const name = r.display_name ?? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}`
        const initials = name.slice(0, 2).toUpperCase()
        return (
          <div
            key={r.wallet}
            className="flex items-start gap-2 border border-zinc-800 bg-zinc-900/60 p-2"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ background: "#534AB7" }}>
              {initials}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-mono text-[10px] font-medium text-zinc-200 truncate">{name}</span>
              <span className="font-mono text-[8px] text-zinc-600 truncate">
                {r.wallet.slice(0, 6)}…{r.wallet.slice(-4)}
              </span>
              <SocialChips profile={{
                display_name: r.display_name ?? undefined,
                twitter: r.twitter ?? undefined,
                discord: r.discord ?? undefined,
                telegram: r.telegram ?? undefined,
              }} />
            </div>
            <a
              href={`/profile/${r.wallet}`}
              className="shrink-0 font-mono text-[8px] uppercase tracking-widest text-violet-500 hover:text-violet-300 transition-colors"
            >
              {t.viewProfile}
            </a>
          </div>
        )
      })}
    </div>
  )
}

type ProfilePanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  address: string
  disconnect: () => void
}

export function ProfilePanel({ open, onOpenChange, address, disconnect }: ProfilePanelProps) {
  const { lang } = useLang()

  const [tab, setTab] = useState<Tab>("artifacts")
  const [profile, setProfile] = useState<ProfileData>({})
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ProfileData>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")
  const [nfts, setNfts] = useState<NftItem[]>([])
  const [nftsLoading, setNftsLoading] = useState(false)
  const [worldsCount, setWorldsCount] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const t =
    lang === "es"
      ? {
          profile: "◈ PERFIL",
          artifacts: "ARTEFACTOS",
          rewards: "RECOMPENSAS",
          statArtifacts: "ARTEFACTOS",
          statWorlds: "MUNDOS",
          statPhaseLQ: "PHASELQ",
          statNarratives: "NARRATIVAS",
          socialLabel: "// SOCIAL_LINKS",
          displayName: "Nombre",
          twitter: "Twitter / X",
          discord: "Discord",
          telegram: "Telegram",
          edit: "[ EDITAR ]",
          save: "[ GUARDAR ]",
          cancel: "[ CANCELAR ]",
          saving: "[ GUARDANDO... ]",
          saved: "[ GUARDADO ]",
          copyAddress: "[ COPIAR ]",
          copied: "[ COPIADO ]",
          disconnect: "[ DESCONECTAR_WALLET ]",
          noArtifacts: "Sin artefactos en esta wallet.",
          loading: "···",
          search: "BUSCAR",
          searchPlaceholder: "Buscar por nombre, @twitter, discord o wallet...",
          searchInitial: "[ INGRESAR_TÉRMINO ]",
          searchNoResults: "[ SIN_RESULTADOS ]",
          searchSearching: "[ BUSCANDO… ]",
          viewProfile: "[ VER_PERFIL ]",
          placeholder: {
            displayName: "alias o nombre",
            twitter: "@handle",
            discord: "usuario#0000",
            telegram: "@handle",
          },
        }
      : {
          profile: "◈ PROFILE",
          artifacts: "ARTIFACTS",
          rewards: "REWARDS",
          statArtifacts: "ARTIFACTS",
          statWorlds: "WORLDS",
          statPhaseLQ: "PHASELQ",
          statNarratives: "NARRATIVES",
          socialLabel: "// SOCIAL_LINKS",
          displayName: "Display name",
          twitter: "Twitter / X",
          discord: "Discord",
          telegram: "Telegram",
          edit: "[ EDIT ]",
          save: "[ SAVE ]",
          cancel: "[ CANCEL ]",
          saving: "[ SAVING... ]",
          saved: "[ SAVED ]",
          copyAddress: "[ COPY ]",
          copied: "[ COPIED ]",
          disconnect: "[ DISCONNECT_WALLET ]",
          noArtifacts: "No artifacts in this wallet.",
          loading: "···",
          search: "SEARCH",
          searchPlaceholder: "Search by name, @twitter, discord or wallet...",
          searchInitial: "[ ENTER_SEARCH_TERM ]",
          searchNoResults: "[ NO_RESULTS ]",
          searchSearching: "[ SEARCHING… ]",
          viewProfile: "[ VIEW_PROFILE ]",
          placeholder: {
            displayName: "alias or name",
            twitter: "@handle",
            discord: "user#0000",
            telegram: "@handle",
          },
        }

  const loadProfile = useCallback(async () => {
    if (!address) return
    try {
      const res = await fetch(`/api/profile?wallet=${encodeURIComponent(address)}`)
      if (!res.ok) return
      const json = (await res.json()) as { profile: ProfileData | null }
      if (json.profile) {
        setProfile(json.profile)
        setForm(json.profile)
      }
    } catch { /* ignore */ }
  }, [address])

  const loadNfts = useCallback(async () => {
    if (!address) return
    setNftsLoading(true)
    try {
      const res = await fetch(`/api/wallet/phase-nfts?address=${encodeURIComponent(address)}`)
      if (!res.ok) return
      const json = (await res.json()) as { items?: NftItem[] }
      setNfts(json.items ?? [])
    } catch { /* ignore */ }
    finally { setNftsLoading(false) }
  }, [address])

  const loadWorlds = useCallback(async () => {
    try {
      const res = await fetch("/api/world")
      if (!res.ok) return
      const json = (await res.json()) as { items?: unknown[] }
      setWorldsCount(json.items?.length ?? 0)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!open || !address) return
    void loadProfile()
    void loadNfts()
    void loadWorlds()
  }, [open, address, loadProfile, loadNfts, loadWorlds])

  async function handleSave() {
    setSaving(true)
    setSaveMsg("")
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, ...form }),
      })
      if (!res.ok) throw new Error("save failed")
      setProfile(form)
      setEditing(false)
      setSaveMsg(t.saved)
      setTimeout(() => setSaveMsg(""), 2500)
    } catch {
      setSaveMsg("Error")
    } finally {
      setSaving(false)
    }
  }

  function handleDisconnect() {
    onOpenChange(false)
    setTimeout(disconnect, 150)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "artifacts", label: t.artifacts },
    { id: "rewards", label: t.rewards },
    { id: "search", label: t.search },
  ]

  const SOCIAL_FIELDS = [
    { key: "display_name" as const, label: t.displayName, ph: t.placeholder.displayName },
    { key: "twitter" as const, label: t.twitter, ph: t.placeholder.twitter },
    { key: "discord" as const, label: t.discord, ph: t.placeholder.discord },
    { key: "telegram" as const, label: t.telegram, ph: t.placeholder.telegram },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(100vw,22rem)] flex flex-col gap-0 p-0 border-l border-violet-800/30 bg-[#0a0a0f] text-zinc-100 overflow-hidden"
      >
        <SheetTitle className="sr-only">{t.profile}</SheetTitle>

        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-4 border-b border-violet-800/20 flex items-start gap-3">
          {/* Avatar */}
          <div className="h-10 w-10 shrink-0 rounded-full border border-violet-700/40 bg-violet-900/50 flex items-center justify-center">
            <span className="font-mono text-[11px] font-bold tracking-widest text-violet-300">
              {avatarInitials(profile.display_name, address)}
            </span>
          </div>

          {/* Identity */}
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400 mb-0.5">
              {t.profile}
            </p>
            {profile.display_name && (
              <p className="font-mono text-[11px] text-zinc-200 font-medium truncate mb-0.5">
                {profile.display_name}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-widest text-zinc-500 truncate">
                {truncateAddress(address)}
              </span>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="shrink-0 font-mono text-[8px] uppercase tracking-widest text-zinc-700 hover:text-violet-400 transition-colors"
              >
                {copied ? t.copied : t.copyAddress}
              </button>
            </div>
          </div>
        </div>

        {/* ── Stats 2×2 ── */}
        <div className="grid grid-cols-2 gap-px bg-violet-800/10 border-b border-violet-800/20">
          {[
            { label: t.statArtifacts, value: nftsLoading ? t.loading : nfts.length },
            { label: t.statPhaseLQ,   value: "—" },
            { label: t.statWorlds,    value: worldsCount ?? t.loading },
            { label: t.statNarratives,value: nfts.length > 0 ? nfts.length : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-zinc-900/80 px-4 py-3 flex flex-col gap-1">
              <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-zinc-500">
                {label}
              </span>
              <span className="font-mono text-[20px] font-medium leading-none text-zinc-100">
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* ── Social links ── */}
        <div className="px-5 py-3 border-b border-violet-800/20">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[8px] uppercase tracking-widest text-zinc-600">
              {t.socialLabel}
            </span>
            {!editing && (
              <div className="flex items-center gap-3">
                {saveMsg && (
                  <span className="font-mono text-[8px] text-violet-500">{saveMsg}</span>
                )}
                <button
                  type="button"
                  onClick={() => { setForm(profile); setEditing(true) }}
                  className="font-mono text-[8px] uppercase tracking-widest text-zinc-600 hover:text-violet-400 transition-colors"
                >
                  {t.edit}
                </button>
              </div>
            )}
          </div>

          {!editing ? (
            /* View mode */
            <SocialChips profile={profile} />
          ) : (
            /* Edit mode */
            <div className="space-y-1.5">
              {SOCIAL_FIELDS.map(({ key, label, ph }) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="w-20 shrink-0 font-mono text-[8px] uppercase tracking-widest text-zinc-600">
                    {label}
                  </label>
                  <input
                    type="text"
                    value={form[key] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={ph}
                    className="flex-1 h-8 border border-zinc-700 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-violet-600 transition-colors"
                    maxLength={40}
                  />
                </div>
              ))}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="font-mono text-[8px] uppercase tracking-widest text-violet-400 hover:text-violet-200 transition-colors disabled:opacity-50"
                >
                  {saving ? t.saving : t.save}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setForm(profile) }}
                  className="font-mono text-[8px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-violet-800/20 shrink-0">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={[
                "flex-1 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                tab === id
                  ? "text-violet-300 border-b-2 border-violet-500 -mb-px"
                  : "text-zinc-600 hover:text-zinc-400",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {tab === "artifacts" && (
            nftsLoading ? (
              <p className="font-mono text-[9px] text-zinc-600 pt-2">{t.loading}</p>
            ) : nfts.length === 0 ? (
              <p className="font-mono text-[9px] text-zinc-600 pt-2">{t.noArtifacts}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {nfts.map((nft) => (
                  <div key={nft.tokenId} className="group flex flex-col gap-1">
                    <div className="aspect-square overflow-hidden border border-zinc-800 bg-zinc-900 group-hover:border-violet-700/50 transition-colors">
                      {nft.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={nft.image} alt={nft.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <span className="font-mono text-[8px] text-zinc-700">#{nft.tokenId}</span>
                        </div>
                      )}
                    </div>
                    <p className="font-mono text-[8px] text-zinc-600 truncate leading-tight">
                      {nft.name}
                    </p>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "rewards" && (
            <div className="pt-2 space-y-1">
              <a
                href="/faucet"
                className="block font-mono text-[9px] uppercase tracking-widest text-zinc-600 hover:text-violet-400 transition-colors"
              >
                → FAUCET / REWARDS
              </a>
            </div>
          )}

          {tab === "search" && <SearchTab t={t} />}
        </div>

        {/* ── Disconnect ── */}
        <div className="px-5 py-3 border-t border-violet-800/20 shrink-0">
          <button
            type="button"
            onClick={handleDisconnect}
            className="font-mono text-[9px] uppercase tracking-widest text-red-400/60 hover:text-red-400 transition-colors"
          >
            {t.disconnect}
          </button>
        </div>

      </SheetContent>
    </Sheet>
  )
}
