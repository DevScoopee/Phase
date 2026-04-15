"use client"

import { useState, useEffect, useCallback } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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
  const [copied, setCopied] = useState(false)

  const t =
    lang === "es"
      ? {
          profile: "PERFIL",
          artifacts: "ARTEFACTOS",
          rewards: "RECOMPENSAS",
          displayName: "Nombre",
          twitter: "Twitter / X",
          discord: "Discord",
          telegram: "Telegram",
          edit: "[ EDITAR ]",
          save: "[ GUARDAR ]",
          cancel: "[ CANCELAR ]",
          saving: "[ GUARDANDO... ]",
          saved: "[ GUARDADO ]",
          copyAddress: "[ COPIAR DIRECCIÓN ]",
          copied: "[ COPIADO ]",
          disconnect: "[ DESCONECTAR ]",
          noArtifacts: "Sin artefactos en esta wallet.",
          loading: "Cargando...",
          placeholder: {
            displayName: "alias o nombre",
            twitter: "@handle",
            discord: "usuario#0000",
            telegram: "@handle",
          },
        }
      : {
          profile: "PROFILE",
          artifacts: "ARTIFACTS",
          rewards: "REWARDS",
          displayName: "Display name",
          twitter: "Twitter / X",
          discord: "Discord",
          telegram: "Telegram",
          edit: "[ EDIT ]",
          save: "[ SAVE ]",
          cancel: "[ CANCEL ]",
          saving: "[ SAVING... ]",
          saved: "[ SAVED ]",
          copyAddress: "[ COPY ADDRESS ]",
          copied: "[ COPIED ]",
          disconnect: "[ DISCONNECT ]",
          noArtifacts: "No artifacts in this wallet.",
          loading: "Loading...",
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
    } catch {
      /* ignore */
    }
  }, [address])

  const loadNfts = useCallback(async () => {
    if (!address) return
    setNftsLoading(true)
    try {
      const res = await fetch(`/api/wallet/phase-nfts?address=${encodeURIComponent(address)}`)
      if (!res.ok) return
      const json = (await res.json()) as { items?: NftItem[] }
      setNfts(json.items ?? [])
    } catch {
      /* ignore */
    } finally {
      setNftsLoading(false)
    }
  }, [address])

  useEffect(() => {
    if (!open || !address) return
    void loadProfile()
    void loadNfts()
  }, [open, address, loadProfile, loadNfts])

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
    } catch {
      /* ignore */
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "artifacts", label: t.artifacts },
    { id: "rewards", label: t.rewards },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(100vw,22rem)] flex flex-col gap-0 p-0 border-l border-violet-800/30 bg-zinc-950 text-violet-100"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-violet-800/20">
          <SheetTitle className="font-mono text-[10px] font-bold uppercase tracking-widest text-violet-400">
            {t.profile}
          </SheetTitle>
          <div className="flex items-center gap-2 mt-1">
            <span className="h-2 w-2 rounded-full bg-violet-400 shrink-0" aria-hidden />
            <span className="font-mono text-[11px] tracking-widest text-violet-300 truncate">
              {truncateAddress(address)}
            </span>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="ml-auto font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-violet-400 transition-colors"
            >
              {copied ? t.copied : t.copyAddress}
            </button>
          </div>
        </SheetHeader>

        {/* Social card */}
        <div className="px-5 py-4 border-b border-violet-800/20">
          {!editing ? (
            <div className="space-y-1">
              {profile.display_name && (
                <p className="font-mono text-[11px] text-violet-200 font-medium">
                  {profile.display_name}
                </p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {profile.twitter && (
                  <span className="font-mono text-[9px] text-zinc-500">𝕏 {profile.twitter}</span>
                )}
                {profile.discord && (
                  <span className="font-mono text-[9px] text-zinc-500">DC {profile.discord}</span>
                )}
                {profile.telegram && (
                  <span className="font-mono text-[9px] text-zinc-500">TG {profile.telegram}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setForm(profile); setEditing(true) }}
                className="mt-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600 hover:text-violet-400 transition-colors"
              >
                {t.edit}
              </button>
              {saveMsg && (
                <span className="ml-3 font-mono text-[9px] text-violet-500">{saveMsg}</span>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {(
                [
                  { key: "display_name" as const, label: t.displayName, ph: t.placeholder.displayName },
                  { key: "twitter" as const, label: t.twitter, ph: t.placeholder.twitter },
                  { key: "discord" as const, label: t.discord, ph: t.placeholder.discord },
                  { key: "telegram" as const, label: t.telegram, ph: t.placeholder.telegram },
                ] as const
              ).map(({ key, label, ph }) => (
                <div key={key}>
                  <label className="block font-mono text-[8px] uppercase tracking-widest text-zinc-600 mb-0.5">
                    {label}
                  </label>
                  <input
                    type="text"
                    value={form[key] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={ph}
                    className="w-full rounded-none border border-violet-800/30 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-violet-200 placeholder:text-zinc-700 focus:outline-none focus:border-violet-600"
                    maxLength={40}
                  />
                </div>
              ))}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="font-mono text-[9px] uppercase tracking-widest text-violet-400 hover:text-violet-200 transition-colors disabled:opacity-50"
                >
                  {saving ? t.saving : t.save}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setForm(profile) }}
                  className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-violet-800/20">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={[
                "flex-1 py-2 font-mono text-[9px] uppercase tracking-widest transition-colors",
                tab === id
                  ? "text-violet-300 border-b-2 border-violet-500"
                  : "text-zinc-600 hover:text-zinc-400",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          {tab === "artifacts" && (
            nftsLoading ? (
              <p className="font-mono text-[9px] text-zinc-600">{t.loading}</p>
            ) : nfts.length === 0 ? (
              <p className="font-mono text-[9px] text-zinc-600">{t.noArtifacts}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {nfts.map((nft) => (
                  <div
                    key={nft.tokenId}
                    className="aspect-square rounded-sm overflow-hidden border border-violet-800/20 bg-zinc-900"
                    title={nft.name}
                  >
                    {nft.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={nft.image}
                        alt={nft.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <span className="font-mono text-[8px] text-zinc-700">#{nft.tokenId}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "rewards" && (
            <div className="space-y-2">
              <a
                href="/faucet"
                className="block font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-violet-400 transition-colors"
              >
                → FAUCET / REWARDS
              </a>
            </div>
          )}
        </div>

        {/* Disconnect — bottom of panel */}
        <div className="px-5 py-4 border-t border-violet-800/20">
          <button
            type="button"
            onClick={handleDisconnect}
            className="w-full font-mono text-[9px] uppercase tracking-widest text-red-900 hover:text-red-500 transition-colors text-left"
          >
            {t.disconnect}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
