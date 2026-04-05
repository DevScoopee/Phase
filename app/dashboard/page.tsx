"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { signTransaction } from "@stellar/freighter-api"
import { LangToggle } from "@/components/lang-toggle"
import { useLang } from "@/components/lang-context"
import { PhaseProtectedPreview } from "@/components/phase-protected-preview"
import { TokenIcon } from "@/components/token-icon"
import { useWallet } from "@/components/wallet-provider"
import { pickCopy } from "@/lib/phase-copy"
import { cn } from "@/lib/utils"
import {
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
  buildTransferPhaseNftTransaction,
  checkHasPhased,
  fetchCollectionsCatalog,
  fetchTokenOwnerAddress,
  fetchTokenMetadataDisplay,
  fetchTokenUriString,
  getTransactionResult,
  ipfsOrHttpsDisplayUrl,
  isValidClassicStellarAddress,
  liqToStroops,
  PHASER_LIQ_SYMBOL,
  sendTransaction,
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

type PlatformListing = {
  id: string
  seller: string
  collectionId: number
  tokenId: number
  priceStroops: string
  createdAt: string
  active: boolean
}

type SellTarget = {
  collectionId: number
  tokenId: number
  collectionName: string
}

export default function DashboardPage() {
  const router = useRouter()
  const { lang } = useLang()
  const t = pickCopy(lang)
  const d = t.dashboard
  const n = t.nav

  const { address, connect, disconnect, connecting, refresh } = useWallet()
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
  const [listings, setListings] = useState<PlatformListing[]>([])
  const [listingsErr, setListingsErr] = useState<string | null>(null)
  const [sellTarget, setSellTarget] = useState<SellTarget | null>(null)
  const [buyerAddress, setBuyerAddress] = useState("")
  const [listPriceLiq, setListPriceLiq] = useState("")
  const [transferBusy, setTransferBusy] = useState(false)
  const [sellFeedback, setSellFeedback] = useState<string | null>(null)
  const [vaultItems, setVaultItems] = useState<
    Array<{
      tokenId: number
      name: string
      description: string
      image: string
      collectionId: number | null
    }>
  >([])
  const [vaultState, setVaultState] = useState<"idle" | "loading" | "error" | "done">("idle")
  const [vaultErr, setVaultErr] = useState<string | null>(null)

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

  const loadListings = useCallback(async () => {
    setListingsErr(null)
    try {
      const res = await fetch("/api/nft-listings")
      const data = (await res.json()) as { listings?: PlatformListing[] }
      setListings(Array.isArray(data.listings) ? data.listings : [])
    } catch {
      setListingsErr(d.listingLoadError)
    }
  }, [d.listingLoadError])

  const loadVault = useCallback(async () => {
    if (!address) {
      setVaultItems([])
      setVaultState("idle")
      setVaultErr(null)
      return
    }
    setVaultState("loading")
    setVaultErr(null)
    try {
      const res = await fetch(`/api/wallet/phase-nfts?address=${encodeURIComponent(address)}`)
      if (!res.ok) throw new Error("VAULT_HTTP")
      const data = (await res.json()) as {
        items?: Array<{
          tokenId: number
          name: string
          description: string
          image: string
          collectionId: number | null
        }>
      }
      setVaultItems(Array.isArray(data.items) ? data.items : [])
      setVaultState("done")
    } catch {
      setVaultErr(d.vaultRpcError)
      setVaultState("error")
      setVaultItems([])
    }
  }, [address, d.vaultRpcError])

  useEffect(() => {
    void load().catch(() => {})
  }, [load])

  useEffect(() => {
    void loadListings().catch(() => {})
  }, [loadListings])

  useEffect(() => {
    void loadVault().catch(() => {})
  }, [loadVault])

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
        const meta = raw ? await fetchTokenMetadataDisplay(raw) : {}
        const imageFromToken = meta.image?.trim() ?? ""
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

  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push("/")
    }
  }, [router])

  const closeSellModal = useCallback(() => {
    setSellTarget(null)
    setBuyerAddress("")
    setListPriceLiq("")
    setSellFeedback(null)
  }, [])

  const publishListing = useCallback(async () => {
    if (!address || !sellTarget) return
    const stroops = liqToStroops(listPriceLiq.trim() || "0")
    if (stroops === "0") {
      setSellFeedback(lang === "es" ? "Indicá un precio mayor a 0." : "Enter a price greater than 0.")
      return
    }
    setTransferBusy(true)
    setSellFeedback(null)
    try {
      const res = await fetch("/api/nft-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller: address,
          collectionId: sellTarget.collectionId,
          tokenId: sellTarget.tokenId,
          priceStroops: stroops,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || "LISTING_FAIL")
      await loadListings()
      setSellFeedback(lang === "es" ? "Anuncio publicado." : "Listing published.")
    } catch (e) {
      setSellFeedback(e instanceof Error ? e.message : String(e))
    } finally {
      setTransferBusy(false)
    }
  }, [address, sellTarget, listPriceLiq, loadListings, lang])

  const delist = useCallback(
    async (id: string) => {
      setTransferBusy(true)
      setSellFeedback(null)
      try {
        const res = await fetch("/api/nft-listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancelId: id }),
        })
        const data = (await res.json()) as { ok?: boolean }
        if (!res.ok || !data.ok) throw new Error("DELIST_FAIL")
        await loadListings()
      } catch (e) {
        setSellFeedback(e instanceof Error ? e.message : String(e))
      } finally {
        setTransferBusy(false)
      }
    },
    [loadListings],
  )

  const transferToBuyer = useCallback(async () => {
    if (!address || !sellTarget) return
    const to = buyerAddress.trim()
    if (!isValidClassicStellarAddress(to)) {
      setSellFeedback(lang === "es" ? "Dirección G… inválida." : "Invalid G… address.")
      return
    }
    if (to === address) {
      setSellFeedback(lang === "es" ? "No podés transferirte a vos mismo." : "Cannot transfer to yourself.")
      return
    }
    setTransferBusy(true)
    setSellFeedback(null)
    try {
      const txEnvelope = await buildTransferPhaseNftTransaction(address, to, sellTarget.tokenId)
      const signResult = await signTransaction(txEnvelope, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      })
      if (signResult.error) throw new Error(signResult.error.message || "SIGN_FAIL")
      const signedXdr =
        (signResult as { signedTxXdr?: string }).signedTxXdr ||
        (signResult as { signedTransaction?: string }).signedTransaction
      if (!signedXdr) throw new Error("NO_SIGNED_XDR")
      const sendResult = await sendTransaction(signedXdr)
      await getTransactionResult(sendResult.hash as string)
      await load()
      await loadListings()
      await loadVault()
      closeSellModal()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSellFeedback(`${msg} — ${d.transferWasmHint}`)
    } finally {
      setTransferBusy(false)
    }
  }, [address, sellTarget, buyerAddress, load, loadListings, loadVault, closeSellModal, lang, d.transferWasmHint])

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <div className="grid-bg pointer-events-none fixed inset-0 opacity-40" aria-hidden />

      <header
        className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b-4 border-double px-4 py-3 md:px-6"
        style={{ borderColor: CYAN }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => goBack()} className={navLinkClass}>
            {d.back}
          </button>
          <Link href="/" className={navLinkClass}>
            {n.home}
          </Link>
        </div>
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
        <div className="border-4 border-double border-cyan-400/55 bg-[oklch(0.05_0_0)] p-6 shadow-[0_0_32px_rgba(0,255,255,0.06)] md:p-8">
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

          <section className="mt-10 border-4 border-double border-cyan-500/35 bg-black/35 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">{d.platformListings}</h2>
              <button
                type="button"
                onClick={() => void loadListings().catch(() => {})}
                className="rounded border border-cyan-500/50 px-2 py-1 text-[9px] font-bold uppercase text-cyan-200 hover:bg-cyan-950/40"
              >
                {d.refresh}
              </button>
            </div>
            {listingsErr ? (
              <p className="mt-2 text-[10px] text-red-300/90">{listingsErr}</p>
            ) : listings.length === 0 ? (
              <p className="mt-3 text-[10px] uppercase tracking-wider text-cyan-200/75">
                {lang === "es" ? "Sin anuncios activos." : "No active listings."}
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {listings.map((l) => (
                  <li key={l.id} className="border-2 border-cyan-500/40 bg-black/50 p-3">
                    <p className="text-[10px] font-semibold uppercase text-cyan-100">
                      #{l.tokenId} · coll #{l.collectionId}
                    </p>
                    <p className="mt-1 text-[9px] text-cyan-300/85">
                      {d.creator} {truncateAddress(l.seller)}
                    </p>
                    <p className="mt-1 text-[10px] text-cyan-200">
                      {stroopsToLiqDisplay(l.priceStroops)} {PHASER_LIQ_SYMBOL}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link href={`/chamber?collection=${l.collectionId}`} className={secondaryCardBtn}>
                        {d.openChamber}
                      </Link>
                      {address && l.seller === address ? (
                        <button
                          type="button"
                          disabled={transferBusy}
                          onClick={() => void delist(l.id).catch(() => {})}
                          className="rounded border border-orange-500/50 px-2 py-1.5 text-[9px] font-bold uppercase text-orange-200 hover:bg-orange-950/30 disabled:opacity-40"
                        >
                          {d.cancelListing}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {address && (
            <section className="mt-10 border-4 border-double border-cyan-500/35 bg-black/35 p-4">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">{d.myArtifactsSection}</h2>
              {ownedArtifacts.length === 0 ? (
                <p className="mt-3 text-[10px] uppercase tracking-wider text-cyan-200/75">
                  {lang === "es"
                    ? "Aún no se detectan artefactos estabilizados para esta wallet."
                    : "No stabilized artifacts detected for this wallet yet."}
                </p>
              ) : (
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ownedArtifacts.map((a) => (
                    <li key={`${a.collectionId}-${a.tokenId}`} className="border-2 border-cyan-500/45 bg-black/55 p-2.5">
                      <div className="aspect-[4/3] overflow-hidden border border-cyan-500/35 bg-black/50">
                        {a.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ipfsOrHttpsDisplayUrl(a.imageUrl)}
                            alt=""
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
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
                      <button
                        type="button"
                        onClick={() => {
                          setSellTarget({
                            collectionId: a.collectionId,
                            tokenId: a.tokenId,
                            collectionName: a.collectionName,
                          })
                          setBuyerAddress("")
                          setListPriceLiq("")
                          setSellFeedback(null)
                        }}
                        className="mt-2 w-full border-2 border-cyan-400/60 bg-cyan-950/35 py-2 text-[9px] font-bold uppercase tracking-widest text-cyan-100 transition-colors hover:bg-cyan-900/40"
                      >
                        {d.sellNft}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {address && (
            <section className="mt-10 border-4 border-double border-emerald-500/35 bg-black/35 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300">
                  {d.vaultRpcTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => void loadVault().catch(() => {})}
                  disabled={vaultState === "loading"}
                  className="rounded border border-emerald-500/50 px-2 py-1 text-[9px] font-bold uppercase text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-45"
                >
                  {vaultState === "loading" ? d.refreshing : d.refresh}
                </button>
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-emerald-100/80">{d.vaultRpcBlurb}</p>
              {vaultErr ? (
                <p className="mt-2 text-[10px] text-red-300/90">{vaultErr}</p>
              ) : null}
              {vaultState === "loading" && !vaultErr ? (
                <p className="mt-3 text-[10px] uppercase tracking-wider text-emerald-200/75">{d.vaultRpcLoading}</p>
              ) : null}
              {vaultState !== "loading" && vaultItems.length === 0 && !vaultErr ? (
                <p className="mt-3 text-[10px] uppercase tracking-wider text-emerald-200/75">{d.vaultRpcEmpty}</p>
              ) : null}
              {vaultItems.length > 0 ? (
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {vaultItems.map((v) => {
                    const col = v.collectionId != null && v.collectionId > 0 ? v.collectionId : 0
                    const chamberHref = col > 0 ? `/chamber?collection=${col}` : "/chamber"
                    return (
                      <li
                        key={`vault-${v.tokenId}`}
                        className="border-2 border-emerald-500/45 bg-black/55 p-2.5"
                      >
                        <div className="aspect-[4/3] overflow-hidden border border-emerald-500/35 bg-black/50">
                          {v.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ipfsOrHttpsDisplayUrl(v.image)}
                              alt=""
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wider text-emerald-500/70">
                              {d.noPreview}
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
                          {v.name}
                        </p>
                        <p className="tactical-phosphor mt-1 text-[9px] font-bold uppercase tracking-wider text-emerald-200">
                          SERIAL_ID #{v.tokenId}
                        </p>
                        <div className="mt-2 flex flex-col gap-2">
                          <Link href={chamberHref} className={secondaryCardBtn}>
                            {d.openChamber}
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setSellTarget({
                                collectionId: col,
                                tokenId: v.tokenId,
                                collectionName: v.name,
                              })
                              setBuyerAddress("")
                              setListPriceLiq("")
                              setSellFeedback(null)
                            }}
                            className="w-full border-2 border-emerald-400/60 bg-emerald-950/35 py-2 text-[9px] font-bold uppercase tracking-widest text-emerald-100 transition-colors hover:bg-emerald-900/40"
                          >
                            {d.sellNft}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </section>
          )}
        </div>
      </main>

      {sellTarget ? (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sell-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto border-4 border-double border-cyan-400/60 bg-[oklch(0.06_0_0)] p-4 shadow-[0_0_40px_rgba(34,211,238,0.2)]">
            <h3 id="sell-modal-title" className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">
              {d.sellModalTitle}
            </h3>
            <p className="mt-2 text-[10px] text-cyan-100/85">
              {sellTarget.collectionName} · #{sellTarget.tokenId}
            </p>
            <p className="mt-3 text-[9px] leading-relaxed text-cyan-300/80">{d.buyerHint}</p>
            <label className="mt-4 block text-[9px] font-semibold uppercase tracking-wider text-cyan-400">
              {d.buyerAddressLabel}
              <input
                type="text"
                value={buyerAddress}
                onChange={(e) => setBuyerAddress(e.target.value)}
                className={inputClass}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="mt-3 block text-[9px] font-semibold uppercase tracking-wider text-cyan-400">
              {d.listingPriceLabel}
              <input
                type="text"
                inputMode="decimal"
                value={listPriceLiq}
                onChange={(e) => setListPriceLiq(e.target.value)}
                className={inputClass}
                placeholder="1.00"
              />
            </label>
            <p className="mt-2 text-[8px] text-cyan-500/80">{d.listingHint}</p>
            {sellFeedback ? (
              <p className="mt-3 text-[10px] text-orange-200/95">{sellFeedback}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={transferBusy}
                onClick={() => void publishListing().catch(() => {})}
                className={primaryCardBtn}
              >
                {transferBusy ? d.transferBusy : d.listingPublish}
              </button>
              <button
                type="button"
                disabled={transferBusy}
                onClick={() => void transferToBuyer().catch(() => {})}
                className={secondaryCardBtn}
              >
                {transferBusy ? d.transferBusy : d.transferNft}
              </button>
              <button
                type="button"
                onClick={closeSellModal}
                disabled={transferBusy}
                className="py-2 text-[10px] font-semibold uppercase text-cyan-500 hover:text-cyan-300"
              >
                {d.close}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
