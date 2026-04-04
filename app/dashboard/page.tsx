"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LangToggle } from "@/components/lang-toggle"
import { ArtistAliasControl } from "@/components/artist-alias-control"
import { useLang } from "@/components/lang-context"
import { PhaseProtectedPreview } from "@/components/phase-protected-preview"
import { TokenIcon } from "@/components/token-icon"
import { useWallet } from "@/components/wallet-provider"
import { pickCopy } from "@/lib/phase-copy"
import { fetchArtistAlias } from "@/lib/artist-profile-client"
import { cn } from "@/lib/utils"
import {
  CONTRACT_ID,
  checkHasPhased,
  fetchCollectionsCatalog,
  fetchTokenOwnerAddress,
  fetchTokenUriString,
  ipfsOrHttpsDisplayUrl,
  parseTokenUriMetadata,
  PHASER_LIQ_SYMBOL,
  stroopsToLiqDisplay,
  type CollectionInfo,
} from "@/lib/phase-protocol"

const CYAN = "#00ffff"

function truncateAddress(addr: string) {
  if (!addr || addr.length < 14) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const navLinkClass =
  "inline-flex min-h-[40px] items-center rounded-sm border-2 border-cyan-400/50 bg-cyan-950/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.15)] transition-colors hover:border-cyan-300 hover:bg-cyan-900/40 hover:text-white"

const primaryCardBtn =
  "flex min-h-[48px] w-full items-center justify-center border-4 border-double border-cyan-400 bg-cyan-500/15 py-3 text-center text-[12px] font-bold uppercase tracking-wide text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.25)] transition-colors hover:bg-cyan-500/25 hover:text-white"

const secondaryCardBtn =
  "flex min-h-[40px] w-full items-center justify-center border-2 border-cyan-500/50 bg-black/50 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-cyan-200/95 transition-colors hover:border-cyan-300 hover:bg-cyan-950/50 hover:text-cyan-50"

export default function DashboardPage() {
  const { lang } = useLang()
  const t = pickCopy(lang)
  const d = t.dashboard
  const n = t.nav

  const { address, connect, disconnect, connecting, refresh, artistAlias } = useWallet()
  const [items, setItems] = useState<CollectionInfo[]>([])
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error" | "done">("idle")
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [verifiedCollectionIds, setVerifiedCollectionIds] = useState<Set<number>>(new Set())
  const [ownedArtifacts, setOwnedArtifacts] = useState<
    Array<{
      collectionId: number
      collectionName: string
      tokenId: number
      imageUrl: string
    }>
  >([])
  const [creatorAliasByWallet, setCreatorAliasByWallet] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoadState("loading")
    setErrMsg(null)
    try {
      const list = await fetchCollectionsCatalog()
      setItems(list)
      setLoadState("done")
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e))
      setLoadState("error")
    }
  }, [])

  useEffect(() => {
    void load().catch(() => {})
  }, [load])

  useEffect(() => {
    if (!address || items.length === 0) {
      setVerifiedCollectionIds(new Set())
      return
    }
    let cancelled = false
    void Promise.all(
      items.map((c) =>
        checkHasPhased(address, c.collectionId).then((r) => ({
          id: c.collectionId,
          phased: r.phased,
        })),
      ),
    )
      .then((results) => {
        if (cancelled) return
        const next = new Set<number>()
        for (const r of results) {
          if (r.phased) next.add(r.id)
        }
        setVerifiedCollectionIds(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [address, items])

  useEffect(() => {
    if (items.length === 0) {
      setCreatorAliasByWallet({})
      return
    }
    let cancelled = false
    const uniqueCreators = Array.from(new Set(items.map((i) => i.creator).filter(Boolean)))
    void Promise.all(uniqueCreators.map(async (wallet) => ({ wallet, alias: await fetchArtistAlias(wallet) })))
      .then((rows) => {
        if (cancelled) return
        const next: Record<string, string> = {}
        for (const row of rows) {
          if (row.alias) next[row.wallet] = row.alias
        }
        setCreatorAliasByWallet(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [items])

  useEffect(() => {
    if (!address || items.length === 0) {
      setOwnedArtifacts([])
      return
    }
    let cancelled = false
    void Promise.all(
      items.map(async (c) => {
        const phase = await checkHasPhased(address, c.collectionId)
        if (!phase.phased || !phase.phaseId) return null
        const owner = await fetchTokenOwnerAddress(CONTRACT_ID, phase.phaseId)
        if (!owner || owner !== address) return null
        const raw = await fetchTokenUriString(phase.phaseId)
        const imageFromToken = raw ? parseTokenUriMetadata(raw).image?.trim() ?? "" : ""
        const imageUrl = imageFromToken || c.imageUri?.trim() || ""
        return {
          collectionId: c.collectionId,
          collectionName: c.name || `Collection #${c.collectionId}`,
          tokenId: phase.phaseId,
          imageUrl,
        }
      }),
    )
      .then((rows) => {
        if (cancelled) return
        setOwnedArtifacts(
          rows.filter((r): r is NonNullable<typeof r> => Boolean(r)).sort((a, b) => a.collectionId - b.collectionId),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [address, items])

  const previewLabels = useMemo(
    () => ({
      pendingFusion: d.previewPendingFusion,
      unverifiedCopy: d.previewUnverifiedCopy,
      chainVerifiedSeal: d.previewChainVerified,
    }),
    [d.previewPendingFusion, d.previewUnverifiedCopy, d.previewChainVerified],
  )

  const inputClass =
    "mt-1 w-full border-4 border-double border-cyan-400/50 bg-black/60 px-3 py-2.5 text-[11px] font-medium text-cyan-50 placeholder:text-cyan-600/80 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <div className="grid-bg fixed inset-0 opacity-40 pointer-events-none" aria-hidden />

      <header
        className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b-4 border-double px-4 py-3 md:px-6"
        style={{ borderColor: CYAN }}
      >
        <Link href="/" className={navLinkClass}>
          {n.home}
        </Link>
        <span className="max-w-[min(56vw,18rem)] text-center text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">
          PHASE · {n.market}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <LangToggle variant="phosphor" />
          <Link href="/forge" className={navLinkClass}>
            {n.forge}
          </Link>
          <Link href="/chamber" className={navLinkClass}>
            {n.chamber}
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-10 md:py-12">
        <div className="border-4 border-double border-cyan-400/55 bg-[oklch(0.05_0_0)] p-6 md:p-8 shadow-[0_0_32px_rgba(0,255,255,0.06)]">
          <div className="flex flex-col gap-4 border-b border-cyan-400/35 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-[12px] font-bold uppercase tracking-[0.28em] text-cyan-200">{d.title}</h1>
              <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-cyan-100/85">{d.subtitle}</p>
              <p className="mt-3 max-w-2xl border-l-2 border-cyan-500/40 pl-3 text-[10px] leading-relaxed text-cyan-300/80">
                {d.shieldBlurb}
              </p>
              <div className="mt-4 max-w-sm">
                <Link href="/forge" className={primaryCardBtn}>
                  {lang === "es" ? "Crear tu NFT → Forja" : "Create your NFT → Forge"}
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load().catch(() => {})}
              disabled={loadState === "loading"}
              className="shrink-0 rounded-sm border-4 border-double border-cyan-400/60 bg-cyan-950/40 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.12)] transition-colors hover:bg-cyan-900/35 disabled:opacity-40"
            >
              {loadState === "loading" ? d.refreshing : d.refresh}
            </button>
          </div>

          <div className="mt-6 border-4 border-double border-cyan-500/35 bg-black/35 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-300/90">{d.wallet}</p>
            {!address ? (
              <button
                type="button"
                disabled={connecting}
                onClick={() => void connect().then(() => refresh()).catch(() => {})}
                className={cn(inputClass, "mt-2 cursor-pointer text-center font-bold uppercase tracking-widest")}
              >
                {connecting ? d.connecting : d.connect}
              </button>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-medium text-cyan-50">{truncateAddress(address)}</span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-cyan-300/85">
                  {lang === "es" ? "Artista" : "Artist"} · {artistAlias ?? (lang === "es" ? "Sin alias" : "No alias")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    disconnect()
                    void refresh().catch(() => {})
                  }}
                  className="rounded border-2 border-cyan-500/45 px-3 py-1.5 text-[10px] font-semibold uppercase text-cyan-200 transition-colors hover:border-red-400/60 hover:text-red-300"
                >
                  {d.disconnect}
                </button>
              </div>
            )}
            {address ? <div className="mt-3"><ArtistAliasControl compact /></div> : null}
          </div>

          {errMsg && (
            <p className="mt-6 border-4 border-double border-red-500/55 bg-red-950/30 px-3 py-2 text-[11px] text-red-200">
              {errMsg}
            </p>
          )}

          {loadState === "done" && items.length === 0 && !errMsg && (
            <p className="mt-10 text-center text-[11px] font-medium uppercase tracking-widest text-cyan-300/80">
              {d.empty}
            </p>
          )}

          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => {
              const img = c.imageUri?.trim() ? ipfsOrHttpsDisplayUrl(c.imageUri) : ""
              const chamberHref = `/chamber?collection=${c.collectionId}`
              const chainVerified = address ? verifiedCollectionIds.has(c.collectionId) : false
              return (
                <li
                  key={c.collectionId}
                  className="flex flex-col border-4 border-double border-cyan-500/40 bg-black/50 shadow-[inset_0_1px_0_rgba(34,211,238,0.12)]"
                >
                  <div className="border-b border-cyan-500/30">
                    {img ? (
                      <PhaseProtectedPreview
                        src={img}
                        chainVerified={chainVerified}
                        viewerAddress={address}
                        labels={previewLabels}
                      />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center bg-[oklch(0.04_0_0)]">
                        <span className="px-2 text-center text-[10px] font-medium uppercase tracking-widest text-cyan-500/70">
                          {d.noPreview}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <p className="line-clamp-2 text-[12px] font-semibold uppercase tracking-wide text-cyan-50">
                      {c.name || `Collection #${c.collectionId}`}
                    </p>
                    <p className="text-[10px] font-medium text-cyan-200/90">
                      {d.id} <span className="text-cyan-300">#{c.collectionId}</span>
                      {" · "}
                      <span className="inline-flex items-center gap-1">
                        {stroopsToLiqDisplay(c.price)} <TokenIcon className="h-3 w-3" /> {PHASER_LIQ_SYMBOL}
                      </span>
                    </p>
                    <p className="text-[9px] font-medium uppercase tracking-wider text-cyan-400/75">
                      {d.creator} {truncateAddress(c.creator)}
                    </p>
                    {creatorAliasByWallet[c.creator] ? (
                      <p className="text-[9px] font-medium uppercase tracking-wider text-cyan-300/85">
                        {lang === "es" ? "Artista" : "Artist"} · {creatorAliasByWallet[c.creator]}
                      </p>
                    ) : null}
                    <div className="mt-auto flex flex-col gap-2 pt-2">
                      <Link href={chamberHref} className={primaryCardBtn}>
                        {d.mint}
                      </Link>
                      <Link href={chamberHref} className={secondaryCardBtn}>
                        {d.openChamber}
                      </Link>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {address && (
            <section className="mt-10 border-4 border-double border-cyan-500/35 bg-black/35 p-4">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">
                [ MY_STABILIZED_ARTIFACTS ]
              </h2>
              {ownedArtifacts.length === 0 ? (
                <p className="mt-3 text-[10px] uppercase tracking-wider text-cyan-200/75">
                  {lang === "es"
                    ? "Aún no se detectan artefactos estabilizados para esta wallet."
                    : "No stabilized artifacts detected for this wallet yet."}
                </p>
              ) : (
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ownedArtifacts.map((a) => {
                    const img = a.imageUrl ? ipfsOrHttpsDisplayUrl(a.imageUrl) : ""
                    return (
                      <li key={`${a.collectionId}-${a.tokenId}`} className="border-2 border-cyan-500/45 bg-black/55 p-2.5">
                        <div className="aspect-[4/3] overflow-hidden border border-cyan-500/35 bg-black/50">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="" className="h-full w-full object-contain" loading="lazy" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wider text-cyan-500/70">
                              {lang === "es" ? "Sin visual" : "No visual"}
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
                          {a.collectionName}
                        </p>
                        <p className="tactical-phosphor mt-1 text-[9px] font-bold uppercase tracking-wider text-cyan-200">
                          SERIAL_ID #{a.tokenId}
                        </p>
                        {img && (
                          <a
                            href={img}
                            download={`phase-artifact-${a.tokenId}.png`}
                            className="mt-2 inline-flex w-full items-center justify-center border border-cyan-400/55 bg-cyan-950/30 px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-cyan-100 transition-colors hover:bg-cyan-900/35"
                          >
                            {lang === "es" ? "Descargar hi-res" : "Download hi-res"}
                          </a>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
