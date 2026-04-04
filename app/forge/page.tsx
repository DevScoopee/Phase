"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { signTransaction } from "@stellar/freighter-api"
import { DesignStudioModal } from "@/components/design-studio-modal"
import { ArtistAliasControl } from "@/components/artist-alias-control"
import { LangToggle } from "@/components/lang-toggle"
import { useLang } from "@/components/lang-context"
import { TokenIcon } from "@/components/token-icon"
import { useWallet } from "@/components/wallet-provider"
import { pickCopy } from "@/lib/phase-copy"
import { composeImageWithPhaseForgeSeal } from "@/lib/forge-seal-image"
import { isIpfsUploadConfigured, uploadToIPFS } from "@/lib/ipfs-upload"
import { cn } from "@/lib/utils"
import { LiquidityFaucetControl } from "@/components/liquidity-faucet-control"
import { TacticalCornerSigil } from "@/components/tactical-corner-sigil"
import {
  NETWORK_PASSPHRASE,
  buildCreateCollectionTransaction,
  fetchCreatorCollectionId,
  getTokenBalance,
  getTransactionResult,
  ipfsOrHttpsDisplayUrl,
  isCreatorAlreadyHasCollectionError,
  liqToStroops,
  sendTransaction,
  stroopsToLiqDisplay,
  PHASER_LIQ_SYMBOL,
  validateFinalContractImageUri,
} from "@/lib/phase-protocol"

export type ImageSourceMode = "PAINT" | "UPLOAD" | "URL"

function truncateAddress(addr: string) {
  if (!addr || addr.length < 14) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const forgeNavBtn =
  "tactical-phosphor inline-flex min-h-[40px] items-center rounded-sm border-2 border-cyan-400/50 bg-cyan-950/45 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.14)] transition-colors hover:border-cyan-300 hover:bg-cyan-900/35 hover:text-white"

export default function ForgePage() {
  const { lang } = useLang()
  const f = pickCopy(lang).forge
  const n = pickCopy(lang).nav

  const { address, connect, disconnect, connecting, refresh, artistAlias } = useWallet()

  const [imageSource, setImageSource] = useState<ImageSourceMode>("URL")
  const [designStudioOpen, setDesignStudioOpen] = useState(false)
  const [name, setName] = useState("")
  const [priceLiq, setPriceLiq] = useState("1")
  const [imageUrl, setImageUrl] = useState("")

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null)

  const [paintBlob, setPaintBlob] = useState<Blob | null>(null)
  const [paintPreviewUrl, setPaintPreviewUrl] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [tickerIdx, setTickerIdx] = useState(0)
  const [ipfsConfigured, setIpfsConfigured] = useState<boolean | null>(null)
  const [tokenBalance, setTokenBalance] = useState("0")

  useEffect(() => {
    void isIpfsUploadConfigured()
      .then(setIpfsConfigured)
      .catch(() => setIpfsConfigured(false))
  }, [])

  const refreshLiqBalance = useCallback(async () => {
    const addr = address ?? (await refresh())
    if (!addr) {
      setTokenBalance("0")
      return
    }
    try {
      const bal = await getTokenBalance(addr)
      setTokenBalance(bal)
    } catch {
      setTokenBalance("0")
    }
  }, [address, refresh])

  useEffect(() => {
    void refreshLiqBalance().catch(() => {})
  }, [refreshLiqBalance])

  const needsPinata = imageSource === "PAINT" || imageSource === "UPLOAD"
  const pinataMissing = needsPinata && ipfsConfigured === false

  useEffect(() => {
    if (!busy) return
    const tickers = pickCopy(lang).forge.deployTickers
    const id = window.setInterval(() => {
      setTickerIdx((i) => (i + 1) % tickers.length)
    }, 900)
    return () => window.clearInterval(id)
  }, [busy, lang])

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(uploadPreviewUrl)
      if (paintPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(paintPreviewUrl)
    }
  }, [uploadPreviewUrl, paintPreviewUrl])

  const revokeUpload = useCallback(() => {
    if (uploadPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(uploadPreviewUrl)
    setUploadPreviewUrl(null)
    setUploadFile(null)
  }, [uploadPreviewUrl])

  const revokePaint = useCallback(() => {
    if (paintPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(paintPreviewUrl)
    setPaintPreviewUrl(null)
    setPaintBlob(null)
  }, [paintPreviewUrl])

  useEffect(() => {
    if (imageSource !== "UPLOAD") revokeUpload()
  }, [imageSource, revokeUpload])

  const previewSrc = (() => {
    if (imageSource === "URL") {
      const t = imageUrl.trim()
      return t ? ipfsOrHttpsDisplayUrl(t) : ""
    }
    if (imageSource === "UPLOAD") return uploadPreviewUrl?.trim() ?? ""
    return paintPreviewUrl?.trim() ?? ""
  })()

  const applySealedDesign = useCallback(
    (blob: Blob) => {
      setError(null)
      revokePaint()
      const url = URL.createObjectURL(blob)
      setPaintBlob(blob)
      setPaintPreviewUrl(url)
    },
    [revokePaint],
  )

  const resolveFinalImageUri = useCallback(async (): Promise<string> => {
    const { forge: ff, imageValidation: ivm } = pickCopy(lang)
    if (imageSource === "URL") {
      const v = validateFinalContractImageUri(imageUrl, ivm)
      if (!v.ok) throw new Error(v.message)
      return v.value
    }
    if (imageSource === "UPLOAD") {
      if (!uploadFile) throw new Error(ff.errors.selectFile)
      const sealed = await composeImageWithPhaseForgeSeal(uploadFile)
      const uri = await uploadToIPFS(sealed)
      const v = validateFinalContractImageUri(uri, ivm)
      if (!v.ok) throw new Error(v.message)
      return v.value
    }
    if (!paintBlob) throw new Error(ff.errors.sealPaint)
    const sealed = await composeImageWithPhaseForgeSeal(paintBlob)
    const uri = await uploadToIPFS(sealed)
    const v = validateFinalContractImageUri(uri, ivm)
    if (!v.ok) throw new Error(v.message)
    return v.value
  }, [lang, imageSource, imageUrl, uploadFile, paintBlob])

  const runCreate = useCallback(async () => {
    const ff = pickCopy(lang).forge
    setError(null)
    setShareUrl(null)
    setCreatedId(null)
    setCopied(false)
    const addr = address ?? (await refresh())
    if (!addr) {
      setError(ff.errors.connectWallet)
      return
    }
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError(ff.errors.nameShort)
      return
    }
    const stroops = liqToStroops(priceLiq)
    if (stroops === "0") {
      setError(ff.errors.priceInvalid)
      return
    }
    const existingId = await fetchCreatorCollectionId(addr)
    if (existingId != null) {
      setCreatedId(existingId)
      if (typeof window !== "undefined") {
        const path = `/chamber?collection=${existingId}`
        setShareUrl(`${window.location.origin}${path}`)
      }
      setError(ff.errors.creatorAlreadyHasCollection.replace("{id}", String(existingId)))
      return
    }
    setBusy(true)
    setTickerIdx(0)
    try {
      const finalUri = await resolveFinalImageUri()
      const txEnvelope = await buildCreateCollectionTransaction(addr, trimmed, stroops, finalUri)
      const signResult = await signTransaction(txEnvelope, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: addr,
      })
      if (signResult.error) throw new Error(signResult.error.message || "SIGN_FAIL")
      const signedXdr =
        (signResult as { signedTxXdr?: string }).signedTxXdr ||
        (signResult as { signedTransaction?: string }).signedTransaction
      if (!signedXdr) throw new Error("NO_SIGNED_XDR")
      const sendResult = await sendTransaction(signedXdr)
      await getTransactionResult(sendResult.hash as string)
      const id = await fetchCreatorCollectionId(addr)
      if (id == null) throw new Error(ff.errors.collectionIdRead)
      setCreatedId(id)
      if (typeof window !== "undefined") {
        const path = `/chamber?collection=${id}`
        setShareUrl(`${window.location.origin}${path}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isCreatorAlreadyHasCollectionError(msg)) {
        const id = await fetchCreatorCollectionId(addr)
        if (id != null) {
          setCreatedId(id)
          if (typeof window !== "undefined") {
            const path = `/chamber?collection=${id}`
            setShareUrl(`${window.location.origin}${path}`)
          }
          setError(ff.errors.creatorAlreadyHasCollection.replace("{id}", String(id)))
          return
        }
      }
      setError(msg)
    } finally {
      setBusy(false)
    }
  }, [lang, address, name, priceLiq, refresh, resolveFinalImageUri])

  const copyShare = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setError(pickCopy(lang).forge.errors.clipboard)
    }
  }, [shareUrl, lang])

  const shellClass = cn(
    "tactical-frame relative overflow-hidden p-6 text-cyan-100 md:p-8",
    busy && "forge-shell--deploying tactical-btn-forge-primary",
  )

  const inputClass =
    "tactical-frame mt-2 w-full border-cyan-500/35 bg-black/55 px-3 py-2.5 text-sm text-cyan-100 placeholder:text-cyan-500/35 focus:border-cyan-400/70 focus:outline-none focus:shadow-[0_0_16px_rgba(0,255,255,0.12)]"

  const modeBtn = (mode: ImageSourceMode, label: string) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setImageSource(mode)
        setError(null)
      }}
      className={cn(
        "tactical-btn flex-1 py-2.5 font-mono text-[9px] uppercase tracking-widest sm:flex-none sm:min-w-[100px]",
        imageSource === mode
          ? "border-cyan-400/70 text-cyan-100 shadow-[0_0_14px_rgba(0,255,255,0.2)]"
          : "border-cyan-500/25 text-cyan-500/60",
      )}
    >
      <span>{label}</span>
    </button>
  )

  const priceReadout = stroopsToLiqDisplay(liqToStroops(priceLiq))

  return (
    <div className="tactical-command-root tactical-command-root--stable relative min-h-screen font-mono text-foreground">
      <div className="tactical-film-grain" aria-hidden />
      <div className="tactical-crt-veil" aria-hidden />
      <TacticalCornerSigil className="pointer-events-none fixed bottom-2 left-2 z-50 hidden opacity-70 sm:block" />

      <header className="tactical-header-bar relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link href="/" className={forgeNavBtn}>
          {f.exit}
        </Link>
        <span className="tactical-phosphor max-w-[min(52vw,14rem)] text-center text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-100">
          {f.title}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <LangToggle variant="phosphor" />
          <Link href="/dashboard" className={forgeNavBtn}>
            {n.market}
          </Link>
          <Link href="/chamber" className={forgeNavBtn}>
            {n.chamber}
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 py-10 md:py-14">
        <div className={shellClass}>
          {busy && (
            <>
              <div className="forge-scanline" aria-hidden />
              <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 text-[9px] uppercase tracking-widest text-[#00ffff]">
                <span className="forge-status-led inline-block size-2 rounded-full bg-[#00ffff]" />
                {f.deployStatus}
              </div>
              <p className="mb-4 border-b border-[#00ffff]/30 pb-3 text-[9px] uppercase tracking-[0.2em] text-[#00ffff]/90">
                {f.deployTickers[tickerIdx % f.deployTickers.length]}
              </p>
            </>
          )}

          {!busy && (
            <h1 className="tactical-phosphor border-b border-cyan-500/30 pb-3 text-[11px] font-bold uppercase tracking-[0.32em] text-cyan-100">
              ◈ {f.registerTitle}
            </h1>
          )}

          {!busy && (
            <p className="mt-4 text-[10px] leading-relaxed text-cyan-200/80 tactical-phosphor">
              {f.intro}
            </p>
          )}

          {!busy && pinataMissing && (
            <div className="tactical-frame mt-4 border-amber-500/45 bg-amber-950/20 px-3 py-3 text-[10px] text-amber-100/90 shadow-[0_0_16px_rgba(245,158,11,0.1)]">
              <p className="font-mono uppercase tracking-widest text-amber-300 tactical-phosphor">⚠ {f.pinataTitle}</p>
              <p className="mt-2 leading-relaxed text-amber-100/85">{f.pinataBody}</p>
            </div>
          )}

          <div className="mt-6">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-cyan-300/80 tactical-phosphor">
              ▣ {f.imageSource}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {modeBtn("PAINT", f.paint)}
              {modeBtn("UPLOAD", f.upload)}
              {modeBtn("URL", f.url)}
            </div>
          </div>

          <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="space-y-5">
              <div>
                <label htmlFor="forge-name" className="text-[9px] font-semibold uppercase tracking-widest text-cyan-300/80 tactical-phosphor">
                  {f.collectionName}
                </label>
                <input
                  id="forge-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={64}
                  disabled={busy}
                  placeholder={f.placeholders.collectionName}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="forge-price" className="text-[9px] font-semibold uppercase tracking-widest text-cyan-300/80 tactical-phosphor">
                  {f.fusionPrice}
                </label>
                <input
                  id="forge-price"
                  value={priceLiq}
                  onChange={(e) => setPriceLiq(e.target.value)}
                  inputMode="decimal"
                  disabled={busy}
                  placeholder={f.placeholders.price}
                  className={inputClass}
                />
                <p className="mt-2 font-mono text-[11px] tabular-nums tracking-wide text-cyan-400/95">
                  <span className="text-cyan-500/75">{f.readout}</span>
                  <span className="mx-2 text-cyan-600/50 select-none" aria-hidden>
                    →
                  </span>
                  <span className="text-cyan-100">{priceReadout}</span>
                  <span className="ml-2 inline-flex items-center gap-1 text-cyan-500/80">
                    <TokenIcon className="h-3.5 w-3.5" />
                    {PHASER_LIQ_SYMBOL}
                  </span>
                </p>
              </div>

              {imageSource === "URL" && (
                <div>
                  <label htmlFor="forge-image-url" className="text-[9px] font-semibold uppercase tracking-widest text-cyan-300/80 tactical-phosphor">
                    {f.metadataUrl}
                  </label>
                  <input
                    id="forge-image-url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    maxLength={256}
                    disabled={busy}
                    placeholder={f.placeholders.imageUrl}
                    className={inputClass}
                    autoComplete="off"
                  />
                  <p className="mt-1.5 text-[8px] leading-relaxed text-cyan-400/75">{f.urlHelp}</p>
                </div>
              )}

              {imageSource === "UPLOAD" && (
                <div>
                  <label htmlFor="forge-file" className="text-[9px] font-semibold uppercase tracking-widest text-cyan-300/80 tactical-phosphor">
                    {f.fileIpfs}
                  </label>
                  <input
                    id="forge-file"
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    className="tactical-frame mt-2 block w-full border-dashed border-cyan-500/30 bg-black/35 px-2 py-2 text-[9px] text-cyan-400/80 file:mr-3 file:border file:border-cyan-500/45 file:bg-transparent file:px-2 file:py-1 file:font-mono file:text-[9px] file:uppercase file:text-cyan-300"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      revokeUpload()
                      if (!f) return
                      setUploadFile(f)
                      setUploadPreviewUrl(URL.createObjectURL(f))
                    }}
                  />
                </div>
              )}

              {imageSource === "PAINT" && (
                <div className="space-y-4 border-4 border-double border-[#00ffff]/25 bg-black/40 p-5">
                  <div className="flex min-h-[140px] flex-col items-center justify-center border-4 border-dashed border-[#00ffff]/20 bg-black px-4 py-8">
                    <span className="text-center font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/90">
                      {f.waitingDesign}
                    </span>
                    {paintPreviewUrl && (
                      <p className="mt-3 text-center font-mono text-[9px] font-medium uppercase tracking-widest text-emerald-300/85">
                        {f.previewHint}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDesignStudioOpen(true)}
                    className="w-full border-4 border-double border-[#00ffff] bg-[#00ffff]/10 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-[#00ffff] shadow-[0_0_20px_rgba(0,255,255,0.15)] transition-all hover:bg-[#00ffff]/18 hover:shadow-[0_0_28px_rgba(0,255,255,0.22)] disabled:opacity-40"
                  >
                    {paintPreviewUrl ? f.reopenDesigner : f.designArtifact}
                  </button>
                  <p className="text-[8px] leading-relaxed text-cyan-400/80">{f.studioBlurb}</p>
                </div>
              )}

              {!address ? (
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => void connect().then(() => refresh()).catch(() => {})}
                  className="mt-4 w-full border-4 border-double border-[#00ffff]/60 py-3.5 text-[10px] uppercase tracking-widest text-[#00ffff] transition-colors hover:bg-[#00ffff]/10 disabled:opacity-50"
                >
                  {connecting ? f.linking : f.linkWallet}
                </button>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-[10px] text-cyan-300/85">
                    {f.walletLabel}: <span className="font-medium text-cyan-50">{truncateAddress(address)}</span>
                  </p>
                  <p className="text-[10px] text-cyan-300/75">
                    {lang === "es" ? "Artista" : "Artist"}:{" "}
                    <span className="font-medium text-cyan-100">{artistAlias ?? (lang === "es" ? "sin alias" : "no alias")}</span>
                  </p>
                  <ArtistAliasControl compact />
                  <p className="font-mono text-[10px] tabular-nums text-cyan-400/90">
                    {pickCopy(lang).chamber.liqBalance}:{" "}
                    <span className="text-cyan-100">
                      {(() => {
                        const n = parseInt(tokenBalance, 10) / 10000000
                        return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} ${PHASER_LIQ_SYMBOL}`
                      })()}
                    </span>
                  </p>
                  <LiquidityFaucetControl
                    address={address}
                    tokenBalance={tokenBalance}
                    onRefreshBalance={refreshLiqBalance}
                  />
                  <button
                    type="button"
                    disabled={busy || pinataMissing}
                    onClick={() => void runCreate().catch(() => {})}
                    className="w-full border-4 border-double border-[#00ffff] bg-[#00ffff]/5 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#00ffff] shadow-[0_0_24px_rgba(0,255,255,0.12)] transition-all hover:bg-[#00ffff]/15 hover:shadow-[0_0_32px_rgba(0,255,255,0.22)] disabled:opacity-40"
                  >
                    {busy ? f.deploying : f.forgeCollection}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      disconnect()
                      void refresh().catch(() => {})
                    }}
                    className="w-full border-2 border-cyan-500/35 py-2 text-[9px] font-semibold uppercase tracking-widest text-cyan-400/80 hover:border-red-500/50 hover:text-red-300"
                  >
                    {f.disconnect}
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col">
              <p className="mb-3 border-b border-cyan-500/35 pb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-200/95">
                {f.artPreview}
              </p>
              <div className="art-retro-monitor flex min-h-[220px] flex-1 flex-col items-center justify-center px-4 py-6">
                {previewSrc ? (
                  <div className="tactical-holo-wrap relative z-[3] max-w-full justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob + external URLs */}
                    <img
                      src={previewSrc}
                      alt=""
                      className="art-retro-monitor__img tactical-holo-img relative z-[3] max-h-[240px] max-w-full"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <span className="relative z-[3] text-center font-mono text-[9px] font-medium uppercase leading-relaxed tracking-[0.2em] text-cyan-400/85">
                    {imageSource === "PAINT" ? (
                      <>
                        {f.waitingDesign}
                        <br />
                        <span className="text-[8px] tracking-widest text-cyan-500/70">{f.paintHint}</span>
                      </>
                    ) : (
                      <>
                        {f.awaitingFeed}
                        <br />
                        <span className="text-[8px] tracking-widest text-cyan-500/70">
                          {imageSource === "URL" && f.urlHint}
                          {imageSource === "UPLOAD" && f.uploadHint}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="tactical-alert-critical relative z-[1] mt-6 px-3 py-3" role="alert">
              <p className="relative z-[1] text-center text-[10px] font-bold uppercase tracking-wider text-red-200">{error}</p>
            </div>
          )}

          {shareUrl && createdId != null && (
            <div className="mt-6 border-4 border-double border-[#00ffff]/70 bg-[#00ffff]/5 px-4 py-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">{f.collectionLive}</p>
              <p className="mt-2 font-mono text-sm text-cyan-50">
                {f.collectionIdLabel} <span className="text-cyan-300">#{createdId}</span>
              </p>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-cyan-400/80">{f.magicLink}</p>
              <a
                href={shareUrl}
                className="mt-2 block break-all rounded border border-[#00ffff]/25 bg-black/30 px-2 py-2 text-[10px] text-[#7fffd4] underline-offset-2 hover:underline"
              >
                {shareUrl}
              </a>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => void copyShare().catch(() => {})}
                  className="inline-flex flex-1 items-center justify-center border-4 border-double border-[#00ffff]/80 px-4 py-2.5 text-[10px] uppercase tracking-widest text-[#00ffff] hover:bg-[#00ffff]/10 sm:flex-none"
                >
                  {copied ? f.copied : f.copy}
                </button>
                <Link
                  href={`/chamber?collection=${createdId}`}
                  className="inline-flex flex-1 items-center justify-center border-4 border-double border-cyan-400/55 bg-cyan-950/25 px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-900/35 sm:flex-none"
                >
                  {f.openChamber}
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <DesignStudioModal
        open={designStudioOpen}
        onOpenChange={setDesignStudioOpen}
        onSeal={applySealedDesign}
      />
    </div>
  )
}
