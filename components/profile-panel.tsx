"use client"

import { useState, useEffect, useCallback } from "react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useLang } from "@/components/lang-context"

type ProfileData = {
  display_name?: string
  twitter?: string
  discord?: string
  telegram?: string
}

type NftItem = {
  tokenId: number
  name: string
  image?: string
  collectionId?: number
}

type Tab = "artifacts" | "rewards"

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
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {profile.twitter && (
                <span className="font-mono text-[9px] text-zinc-500">𝕏 {profile.twitter}</span>
              )}
              {profile.discord && (
                <span className="font-mono text-[9px] text-zinc-500">DC {profile.discord}</span>
              )}
              {profile.telegram && (
                <span className="font-mono text-[9px] text-zinc-500">TG {profile.telegram}</span>
              )}
              {!profile.twitter && !profile.discord && !profile.telegram && (
                <span className="font-mono text-[9px] text-zinc-700">—</span>
              )}
            </div>
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
