"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { signTransaction } from "@stellar/freighter-api"
import { toast } from "sonner"
import { ArtistAliasControl } from "@/components/artist-alias-control"
import { LangToggle } from "@/components/lang-toggle"
import { useLang } from "@/components/lang-context"
import { LiquidityFaucetControl } from "@/components/liquidity-faucet-control"
import { TokenIcon } from "@/components/token-icon"
import { useWallet } from "@/components/wallet-provider"
import { fetchArtistAlias } from "@/lib/artist-profile-client"
import { pickCopy } from "@/lib/phase-copy"
import { cn } from "@/lib/utils"
import {
  buildClassicTrustlineTransactionXdr,
  classicLiqAssetConfigFromPublicEnv,
  parseSignedTxXdr,
  type ClassicLiqWalletStatus,
} from "@/lib/classic-liq"
import type { CollectionInfo } from "@/lib/phase-protocol"
import {
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
  PHASER_LIQ_SYMBOL,
  displayPhaserLiqSymbol,
  REQUIRED_AMOUNT,
  TOKEN_ADDRESS,
  buildSettleTransaction,
  checkHasPhased,
  fetchCollectionInfo,
  fetchCollectionSupply,
  fetchCollectionsCatalog,
  fetchTokenOwnerAddress,
  fetchTokenSymbol,
  fetchTokenUriString,
  formatLiq,
  getTokenBalance,
  getTransactionResult,
  ipfsOrHttpsDisplayUrl,
  isAuthentic,
  isLowEnergy,
  isPhaseInsufficientBalanceError,
  isPhaseUnauthorizedError,
  isStellarDesyncError,
  parseTokenUriMetadata,
  sendTransaction,
  stellarExpertPhaserLiqUrl,
  stroopsToLiqDisplay,
} from "@/lib/phase-protocol"
import { PhaseArtifactVisualizer, type ArtifactVerificationMode } from "@/components/phase-artifact-visualizer"
import { TacticalCornerSigil } from "@/components/tactical-corner-sigil"
import { playTacticalUiClick } from "@/lib/tactical-ui-click"

type PaymentPhase = "idle" | "busy" | "error"

function truncateAddress(addr: string) {
  if (!addr || addr.length < 14) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Enlace al asset PHASERLIQ en Stellar Expert (icono + símbolo). */
function PhaserLiqTokenLink({
  href,
  symbol,
  iconClassName,
  className,
  variant = "default",
}: {
  href: string
  symbol: string
  iconClassName?: string
  className?: string
  variant?: "default" | "amber"
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      onClick={(e) => {
        e.stopPropagation()
        playTacticalUiClick()
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-transparent font-mono tracking-normal underline-offset-[3px] transition-colors hover:underline focus:outline-none",
        variant === "amber"
          ? "text-amber-200/95 hover:border-amber-500/45 hover:bg-amber-950/35 hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-400/55"
          : "text-cyan-400/95 hover:border-cyan-500/45 hover:bg-cyan-950/35 hover:text-cyan-50 focus-visible:ring-2 focus-visible:ring-cyan-400/60",
        className,
      )}
    >
      <TokenIcon className={cn("shrink-0", iconClassName ?? "h-4 w-4")} />
      {symbol}
    </a>
  )
}

const chamberNavLink =
  "tactical-interactive-glitch tactical-phosphor inline-flex min-h-[38px] items-center rounded-sm border-2 border-cyan-400/50 bg-cyan-950/40 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.12)] transition-colors hover:border-cyan-300 hover:bg-cyan-900/35 hover:text-white"

export function FusionChamber() {
  const { lang } = useLang()
  const ch = pickCopy(lang).chamber

  const searchParams = useSearchParams()
  const collectionId = useMemo(() => {
    const raw = searchParams.get("collection")
    if (raw == null || raw === "") return 0
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }, [searchParams])

  const { address, connect, disconnect, connecting, refresh, artistAlias } = useWallet()
  const logEndRef = useRef<HTMLDivElement>(null)
  const logId = useRef(0)
  const [lines, setLines] = useState<{ id: number; text: string }[]>([])

  const [tokenBalance, setTokenBalance] = useState("0")
  const [hasPhased, setHasPhased] = useState<boolean | null>(null)
  const [phaseId, setPhaseId] = useState<number | null>(null)
  const [energyLevelBp, setEnergyLevelBp] = useState<number | null>(null)

  const [x402Tx, setX402Tx] = useState<PaymentPhase>("idle")
  const [genesisLoading, setGenesisLoading] = useState(false)
  const [faucetEnabled, setFaucetEnabled] = useState<boolean | null>(null)
  const [systemDesync, setSystemDesync] = useState(false)
  /** Pedestal: acuñación NFT de fase en curso */
  const [mintingArtifact, setMintingArtifact] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [collectionInfo, setCollectionInfo] = useState<CollectionInfo | null>(null)
  const [collectionLoadState, setCollectionLoadState] = useState<"idle" | "loading" | "done">("idle")
  /** `image` parseado de `token_uri` on-chain (colección 0 o refuerzo). */
  const [artifactImageFromUri, setArtifactImageFromUri] = useState<string | null>(null)
  /** `owner_of(phaseId)` — verificación de originalidad vs wallet conectada. */
  const [onChainTokenOwner, setOnChainTokenOwner] = useState<string | null>(null)
  const [tokenOwnerLookupDone, setTokenOwnerLookupDone] = useState(false)
  const [collectionSupply, setCollectionSupply] = useState<{ minted: number; cap: number } | null>(null)
  const [chainTokenSymbol, setChainTokenSymbol] = useState(PHASER_LIQ_SYMBOL)
  const [balanceGlitch, setBalanceGlitch] = useState(false)
  const prevBalanceRef = useRef<string | null>(null)
  const classicAsset = useMemo(() => classicLiqAssetConfigFromPublicEnv(), [])
  const [classicEnabled, setClassicEnabled] = useState(false)
  const [classicBootstrapAmount, setClassicBootstrapAmount] = useState<string>("0")
  const [classicFundedAt, setClassicFundedAt] = useState<number | null>(null)
  const [classicStatus, setClassicStatus] = useState<ClassicLiqWalletStatus | null>(null)
  const [classicBusy, setClassicBusy] = useState(false)
  const autoTrustlineAttemptedRef = useRef<Set<string>>(new Set())
  const autoClassicFundAttemptedRef = useRef<Set<string>>(new Set())

  const effectivePriceStroops = useMemo(() => {
    if (collectionId > 0 && collectionInfo?.price) return collectionInfo.price
    return REQUIRED_AMOUNT
  }, [collectionId, collectionInfo])

  const isCreatorCurrentCollection = useMemo(() => {
    if (!address || !collectionInfo?.creator) return false
    return address.trim().toUpperCase() === collectionInfo.creator.trim().toUpperCase()
  }, [address, collectionInfo?.creator])

  const invalidCollection =
    collectionId > 0 && collectionLoadState === "done" && collectionInfo == null

  useEffect(() => {
    if (collectionId <= 0) {
      setCollectionInfo(null)
      setCollectionLoadState("done")
      return
    }
    let cancelled = false
    setCollectionLoadState("loading")
    void fetchCollectionInfo(collectionId)
      .then((info) => {
        if (cancelled) return
        setCollectionInfo(info)
        setCollectionLoadState("done")
      })
      .catch(() => {
        if (!cancelled) setCollectionLoadState("done")
      })
    return () => {
      cancelled = true
    }
  }, [collectionId])

  useEffect(() => {
    setArtifactImageFromUri(null)
  }, [collectionId])

  useEffect(() => {
    if (!phaseId || phaseId <= 0) {
      setOnChainTokenOwner(null)
      setTokenOwnerLookupDone(true)
      return
    }
    let cancelled = false
    setTokenOwnerLookupDone(false)
    void fetchTokenOwnerAddress(CONTRACT_ID, phaseId)
      .then((owner) => {
        if (!cancelled) {
          setOnChainTokenOwner(owner)
          setTokenOwnerLookupDone(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOnChainTokenOwner(null)
          setTokenOwnerLookupDone(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [phaseId])

  useEffect(() => {
    if (!hasPhased || phaseId == null || phaseId <= 0) {
      setArtifactImageFromUri(null)
      return
    }
    let cancelled = false
    void fetchTokenUriString(phaseId)
      .then((raw) => {
        if (cancelled || !raw) return
        const { image } = parseTokenUriMetadata(raw)
        if (image && image.trim().length > 0) setArtifactImageFromUri(image.trim())
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hasPhased, phaseId])

  const effectiveArtifactImage = useMemo(() => {
    const fromCol = collectionInfo?.imageUri?.trim() ?? ""
    if (fromCol.length > 0) return fromCol
    return artifactImageFromUri?.trim() ?? ""
  }, [collectionInfo?.imageUri, artifactImageFromUri])

  /** URL lista para `<img>` (gateway si es ipfs://). */
  const collectionPreviewImgSrc = useMemo(() => {
    const raw = collectionInfo?.imageUri?.trim() ?? ""
    if (!raw) return ""
    return ipfsOrHttpsDisplayUrl(raw)
  }, [collectionInfo?.imageUri])

  const [communityCatalog, setCommunityCatalog] = useState<CollectionInfo[]>([])
  const [catalogLoadState, setCatalogLoadState] = useState<"idle" | "loading" | "done">("idle")
  const [creatorAliasByWallet, setCreatorAliasByWallet] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    setCatalogLoadState("loading")
    void fetchCollectionsCatalog()
      .then((list) => {
        if (cancelled) return
        setCommunityCatalog(list)
        setCatalogLoadState("done")
      })
      .catch(() => {
        if (!cancelled) setCatalogLoadState("done")
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (communityCatalog.length === 0) {
      setCreatorAliasByWallet({})
      return
    }
    let cancelled = false
    const uniqueCreators = Array.from(new Set(communityCatalog.map((c) => c.creator).filter(Boolean)))
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
  }, [communityCatalog])

  useEffect(() => {
    void fetch("/api/faucet")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setFaucetEnabled(Boolean(d.enabled)))
      .catch(() => setFaucetEnabled(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchTokenSymbol(TOKEN_ADDRESS)
      .then((symbol) => {
        if (!cancelled && symbol && symbol.trim().length > 0) {
          setChainTokenSymbol(displayPhaserLiqSymbol(symbol))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const appendLog = useCallback((text: string) => {
    const id = logId.current++
    setLines((prev) => [...prev, { id, text }])
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const addr = await refresh()
      if (!addr) {
        setTokenBalance("0")
        setHasPhased(null)
        setPhaseId(null)
        setEnergyLevelBp(null)
        return
      }
      try {
        const bal = await getTokenBalance(addr)
        setTokenBalance(bal)
      } catch {
        setTokenBalance("0")
      }
      const ph = await checkHasPhased(addr, collectionId)
      setHasPhased(ph.phased)
      setPhaseId(ph.phaseId ?? null)
      setEnergyLevelBp(ph.phased ? (ph.energyLevelBp ?? 10_000) : null)
    } catch {
      setTokenBalance("0")
      setHasPhased(null)
      setPhaseId(null)
      setEnergyLevelBp(null)
    }
  }, [refresh, collectionId])

  const refreshClassicStatus = useCallback(async () => {
    if (!classicAsset) {
      setClassicEnabled(false)
      setClassicStatus(null)
      setClassicFundedAt(null)
      setClassicBootstrapAmount("0")
      return
    }
    if (!address) {
      setClassicEnabled(true)
      setClassicStatus(null)
      setClassicFundedAt(null)
      setClassicBootstrapAmount("0")
      return
    }
    try {
      const res = await fetch(`/api/classic-liq?walletAddress=${encodeURIComponent(address)}`, { cache: "no-store" })
      const data = (await res.json().catch(() => ({}))) as {
        enabled?: boolean
        bootstrapAmount?: string
        fundedAt?: number | null
        status?: ClassicLiqWalletStatus
      }
      setClassicEnabled(Boolean(data.enabled))
      setClassicBootstrapAmount(data.bootstrapAmount ?? "0")
      setClassicFundedAt(typeof data.fundedAt === "number" ? data.fundedAt : null)
      setClassicStatus(data.status ?? null)
    } catch {
      setClassicEnabled(false)
      setClassicStatus(null)
      setClassicFundedAt(null)
      setClassicBootstrapAmount("0")
    }
  }, [address, classicAsset])

  useEffect(() => {
    appendLog(pickCopy(lang).chamber.logs.chamberOnline)
    void refreshStatus().catch(() => {})
  }, [appendLog, refreshStatus, lang])

  useEffect(() => {
    void refreshClassicStatus().catch(() => {})
  }, [refreshClassicStatus])

  useEffect(() => {
    if (!logsOpen) return
    const t = window.setTimeout(() => {
      logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }, 160)
    return () => window.clearTimeout(t)
  }, [lines, logsOpen])

  useEffect(() => {
    if (!logsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLogsOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [logsOpen])

  const handleConnect = async () => {
    const logs = pickCopy(lang).chamber.logs
    appendLog(logs.walletRequest)
    try {
      await connect()
      const addr = await refresh()
      if (addr) {
        appendLog(`${logs.walletLinkedPrefix} ${truncateAddress(addr)}`)
      } else {
        appendLog(logs.walletDenied)
      }
    } catch {
      appendLog(logs.walletDenied)
    }
    void refreshStatus().catch(() => {})
    void refreshClassicStatus().catch(() => {})
  }

  const handleAccessPrivateMetadata = useCallback(async () => {
    try {
      if (phaseId == null || phaseId <= 0) return
      const raw = await fetchTokenUriString(phaseId)
      if (!raw) {
        toast.error(lang === "es" ? "Sin token_uri en cadena." : "No on-chain token_uri.")
        return
      }
      let body = raw
      try {
        body = JSON.stringify(JSON.parse(raw), null, 2)
      } catch {
        /* keep raw string */
      }
      const blob = new Blob([body], { type: "application/json;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank", "noopener,noreferrer")
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      toast.success(lang === "es" ? "Metadata abierta en nueva pestaña." : "Metadata opened in new tab.")
    } catch {
      toast.error(lang === "es" ? "No se pudo leer metadata on-chain." : "Could not read on-chain metadata.")
    }
  }, [phaseId, lang])

  const handleNarrativeError = useCallback(
    (err: unknown) => {
      const logs = pickCopy(lang).chamber.logs
      const msg = err instanceof Error ? err.message : String(err)
      if (isStellarDesyncError(msg)) {
        setSystemDesync(true)
        appendLog(logs.systemDesync)
        appendLog(`${logs.tracePrefix} ${msg}`)
        return
      }
      if (isPhaseInsufficientBalanceError(msg)) {
        appendLog(logs.lowEnergyWarning)
        appendLog(`${logs.tracePrefix} ${msg}`)
        return
      }
      appendLog(`${logs.runtimeFaultPrefix} ${msg}`)
    },
    [appendLog, lang],
  )

  const rebootProcess = () => {
    setSystemDesync(false)
    setX402Tx("idle")
    appendLog(pickCopy(lang).chamber.logs.rebootProcess)
    void refreshStatus().catch(() => {})
    void refreshClassicStatus().catch(() => {})
  }

  const delayLog = async (entries: string[]) => {
    for (const t of entries) {
      await new Promise((r) => setTimeout(r, 650))
      appendLog(t)
    }
  }

  const initiateX402 = async () => {
    const logs = pickCopy(lang).chamber.logs
    if (!address || lowEnergy || x402Tx === "busy" || invalidCollection) return
    try {
      const bal = await getTokenBalance(address)
      if (BigInt(bal) < BigInt(effectivePriceStroops)) {
        appendLog(logs.lowEnergyWarning)
        return
      }
      setX402Tx("busy")
      appendLog(logs.x402Initiating)
      await delayLog([logs.receivingChallenge, logs.signingAuth, logs.settlingPayment])
      const invoiceId = Math.floor(Math.random() * 1_000_000)
      const txEnvelope = await buildSettleTransaction(address, effectivePriceStroops, invoiceId, collectionId)
      const signResult = await signTransaction(txEnvelope, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      })
      if (signResult.error) throw new Error(signResult.error.message || "SIGN_FAIL")
      const signedXdr =
        (signResult as { signedTxXdr?: string }).signedTxXdr ||
        (signResult as { signedTransaction?: string }).signedTransaction
      if (!signedXdr) throw new Error("NO_SIGNED_XDR")
      setMintingArtifact(true)
      appendLog(logs.mintingNft)
      const sendResult = await sendTransaction(signedXdr)
      await getTransactionResult(sendResult.hash as string)
      appendLog(logs.decrypting)
      await new Promise((r) => setTimeout(r, 1100))
      appendLog(logs.x402Ok)
      await refreshStatus()
      setMintingArtifact(false)
      appendLog(logs.forgedOnSettle)
    } catch (e) {
      console.error(e)
      setX402Tx("error")
      handleNarrativeError(e)
    } finally {
      setMintingArtifact(false)
      setX402Tx("idle")
    }
  }

  const lowEnergy = address ? isLowEnergy(tokenBalance, effectivePriceStroops) : false
  const canInitializeGenesisSupply = Boolean(
    address &&
      !(hasPhased && phaseId) &&
      !invalidCollection &&
      faucetEnabled &&
      (() => {
        try {
          return BigInt(tokenBalance || "0") === BigInt("0")
        } catch {
          return tokenBalance === "0"
        }
      })(),
  )

  const playElectronicClick = useCallback(() => {
    if (typeof window === "undefined") return
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "square"
    osc.frequency.setValueAtTime(1300, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(720, ctx.currentTime + 0.06)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.085)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.09)
    window.setTimeout(() => void ctx.close(), 180)
  }, [])

  useEffect(() => {
    if (!address) {
      prevBalanceRef.current = null
      return
    }
    if (prevBalanceRef.current == null) {
      prevBalanceRef.current = tokenBalance
      return
    }
    if (prevBalanceRef.current !== tokenBalance) {
      prevBalanceRef.current = tokenBalance
      setBalanceGlitch(true)
      playElectronicClick()
      const t = window.setTimeout(() => setBalanceGlitch(false), 420)
      return () => window.clearTimeout(t)
    }
  }, [address, tokenBalance, playElectronicClick])

  const normalizeToastError = useCallback(
    (msg: string) => (isPhaseUnauthorizedError(msg) ? ch.biometricTrustGateClosed : msg),
    [ch.biometricTrustGateClosed],
  )

  const requestGenesisSupply = useCallback(async () => {
    if (!address || genesisLoading) return
    setGenesisLoading(true)
    appendLog(ch.logs.genesisSupplyRequested)
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, reward: "genesis" }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        detail?: string
        hash?: string
        pending?: boolean
        ok?: boolean
        note?: string
      }
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`
        const detail = typeof data.detail === "string" ? data.detail : undefined
        appendLog(`${ch.logs.faucetFailPrefix} ${msg}${detail ? ` — ${detail}` : ""}`)
        toast.error(normalizeToastError(msg), detail ? { description: detail } : undefined)
        return
      }
      if (data.pending || data.ok === false) {
        const pendingMsg =
          data.note ||
          (lang === "es"
            ? "Transacción de faucet pendiente en ledger. Reintenta en unos segundos."
            : "Faucet transaction pending on ledger. Retry in a few seconds.")
        appendLog(`${ch.logs.tracePrefix} ${pendingMsg}`)
        toast.message(pendingMsg)
        await refreshStatus()
        return
      }
      appendLog(ch.logs.faucetOk)
      appendLog(ch.logs.genesisTransferComplete)
      if (data.hash) appendLog(`${ch.logs.tracePrefix} ${data.hash}`)
      toast.success(ch.logs.genesisTransferComplete, {
        icon: <TokenIcon className="h-4 w-4" pulse />,
      })
      await refreshStatus()
    } catch (e) {
      appendLog(`${ch.logs.faucetFailPrefix} ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenesisLoading(false)
    }
  }, [address, genesisLoading, appendLog, ch.logs, refreshStatus])

  const requestClassicBootstrap = useCallback(async () => {
    if (!address || classicBusy || !classicAsset) return
    setClassicBusy(true)
    try {
      const res = await fetch("/api/classic-liq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; amount?: string }
      if (!res.ok) {
        const msg = data.error || `HTTP ${res.status}`
        appendLog(`${ch.logs.faucetFailPrefix} ${msg}`)
        toast.error(normalizeToastError(msg))
        await refreshClassicStatus()
        return
      }
      appendLog(
        lang === "es"
          ? `[ CLASSIC_ASSET_FONDEADO ] +${data.amount ?? classicBootstrapAmount} ${classicAsset.code}`
          : `[ CLASSIC_ASSET_FUNDED ] +${data.amount ?? classicBootstrapAmount} ${classicAsset.code}`,
      )
      toast.success(
        lang === "es"
          ? `Asset clásico acreditado: +${data.amount ?? classicBootstrapAmount} ${classicAsset.code}`
          : `Classic asset credited: +${data.amount ?? classicBootstrapAmount} ${classicAsset.code}`,
      )
      await refreshClassicStatus()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog(`${ch.logs.faucetFailPrefix} ${msg}`)
      toast.error(normalizeToastError(msg))
    } finally {
      setClassicBusy(false)
    }
  }, [
    address,
    classicAsset,
    classicBootstrapAmount,
    classicBusy,
    appendLog,
    ch.logs.faucetFailPrefix,
    lang,
    normalizeToastError,
    refreshClassicStatus,
  ])

  const enableClassicAssetTrustline = useCallback(async () => {
    if (!address || classicBusy || !classicAsset) return
    setClassicBusy(true)
    try {
      const trustTx = await buildClassicTrustlineTransactionXdr(address, classicAsset)
      const signResult = await signTransaction(trustTx, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      })
      if (signResult.error) throw new Error(signResult.error.message || "TRUSTLINE_SIGNATURE_REJECTED")
      const signedXdr = parseSignedTxXdr(signResult)
      if (!signedXdr) throw new Error("NO_SIGNED_TRUSTLINE_XDR")
      const submitRes = await fetch("/api/classic-liq/trustline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr }),
      })
      const submitData = (await submitRes.json().catch(() => ({}))) as { error?: string }
      if (!submitRes.ok) {
        throw new Error(submitData.error || `HTTP ${submitRes.status}`)
      }
      appendLog(
        lang === "es"
          ? `[ TRUSTLINE_ACTIVADA ] ${classicAsset.code}:${truncateAddress(classicAsset.issuer)}`
          : `[ TRUSTLINE_ENABLED ] ${classicAsset.code}:${truncateAddress(classicAsset.issuer)}`,
      )
      toast.success(
        lang === "es" ? "Trustline activada en Freighter." : "Freighter trustline enabled.",
      )
      await refreshClassicStatus()
      await requestClassicBootstrap()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog(`${ch.logs.faucetFailPrefix} ${msg}`)
      toast.error(normalizeToastError(msg))
    } finally {
      setClassicBusy(false)
    }
  }, [
    address,
    classicAsset,
    classicBusy,
    appendLog,
    ch.logs.faucetFailPrefix,
    lang,
    normalizeToastError,
    refreshClassicStatus,
    requestClassicBootstrap,
  ])

  useEffect(() => {
    if (!address || !classicEnabled || classicBusy) return
    if (!classicAsset || !classicStatus || classicStatus.hasTrustline) return
    if (autoTrustlineAttemptedRef.current.has(address)) return
    autoTrustlineAttemptedRef.current.add(address)
    void enableClassicAssetTrustline().catch(() => {})
  }, [address, classicAsset, classicBusy, classicEnabled, classicStatus, enableClassicAssetTrustline])

  useEffect(() => {
    if (!address || !classicEnabled || classicBusy) return
    if (!classicStatus?.hasTrustline || classicFundedAt) return
    if (autoClassicFundAttemptedRef.current.has(address)) return
    autoClassicFundAttemptedRef.current.add(address)
    void requestClassicBootstrap().catch(() => {})
  }, [address, classicBusy, classicEnabled, classicFundedAt, classicStatus?.hasTrustline, requestClassicBootstrap])

  const chamberTitle = useMemo(() => {
    const c = pickCopy(lang).chamber
    if (collectionId > 0 && collectionInfo) {
      return c.titleWithName.replace("{name}", collectionInfo.name).replace("{id}", String(collectionId))
    }
    if (collectionId > 0) return `${c.collectionTitleLoading} #${collectionId}`
    return c.defaultChamberTitle
  }, [lang, collectionId, collectionInfo])

  const collectionPedestalLine = useMemo(() => {
    const c = pickCopy(lang).chamber
    if (collectionId > 0 && collectionInfo) {
      return c.pedestalWithCreator
        .replace("{name}", collectionInfo.name)
        .replace("{addr}", truncateAddress(collectionInfo.creator))
    }
    if (collectionId > 0) return c.pedestalLoading
    return c.pedestalDefault
  }, [lang, collectionId, collectionInfo])

  const artifactCollectionTitle = useMemo(() => {
    const c = pickCopy(lang).chamber
    if (collectionId > 0 && collectionInfo) {
      return `${collectionInfo.name.toUpperCase()} ${c.artifact.sepSuffix}`.trim()
    }
    return undefined
  }, [lang, collectionId, collectionInfo])

  const artifactPublicCollectionName = useMemo(() => {
    const c = pickCopy(lang).chamber
    if (collectionId > 0 && collectionInfo?.name) return collectionInfo.name
    if (collectionId > 0) return `${c.collectionTitleLoading} #${collectionId}`.replace(/\s+/g, " ").trim()
    return c.pedestalDefault
  }, [lang, collectionId, collectionInfo])

  const processing = x402Tx === "busy"
  const phased = Boolean(hasPhased && phaseId)

  useEffect(() => {
    let cancelled = false
    void fetchCollectionSupply(collectionId)
      .then((s) => {
        if (!cancelled) setCollectionSupply(s)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [collectionId, hasPhased, phaseId])

  const expertUrl = stellarExpertPhaserLiqUrl()
  const isOwnerOnChain =
    phased && phaseId != null && tokenOwnerLookupDone && isAuthentic(address, onChainTokenOwner)
  const authenticityPending = phased && phaseId != null && address != null && !tokenOwnerLookupDone

  const artifactVerificationMode: ArtifactVerificationMode = useMemo(() => {
    if (hasPhased && phaseId != null && phaseId > 0 && address) return "verified"
    if (address && hasPhased === null) return "verifying"
    return "locked"
  }, [address, hasPhased, phaseId])

  return (
    <div className="tactical-command-root tactical-command-root--chamber tactical-command-root--cockpit fixed inset-0 z-[100] flex flex-col overflow-hidden font-mono text-foreground">
      <div className="tactical-film-grain" aria-hidden />
      <div className="tactical-crt-veil" aria-hidden />
      <div className="tactical-crt-fine" aria-hidden />
      <TacticalCornerSigil className="pointer-events-none fixed bottom-2 left-2 z-[200] hidden opacity-70 sm:block" />

      <header className="tactical-header-bar relative z-[102] flex shrink-0 items-center justify-between px-4 py-2 md:px-6">
        <Link href="/" className={chamberNavLink} onClick={() => playTacticalUiClick()}>
          {ch.exit}
        </Link>
        <span className="max-w-[min(52vw,16rem)] truncate text-center text-[10px] uppercase tracking-[0.35em] text-cyan-300 tactical-phosphor">
          {chamberTitle}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <LangToggle variant="phosphor" />
          <Link href="/dashboard" className={chamberNavLink} onClick={() => playTacticalUiClick()}>
            {ch.market}
          </Link>
          <Link href="/forge" className={chamberNavLink} onClick={() => playTacticalUiClick()}>
            {ch.forge}
          </Link>
          <button
            type="button"
            onClick={() => {
              playTacticalUiClick()
              void refreshStatus().catch(() => {})
              void refreshClassicStatus().catch(() => {})
            }}
            className={`${chamberNavLink} cursor-pointer border-dashed`}
          >
            ⟳ {ch.sync}
          </button>
          <button
            type="button"
            onClick={() => {
              playTacticalUiClick()
              setLogsOpen((o) => !o)
            }}
            aria-expanded={logsOpen}
            aria-controls="chamber-logs-panel"
            className={cn(chamberNavLink, "cursor-pointer", logsOpen && "border-cyan-300/80 text-white")}
          >
            {ch.logsToggle}
          </button>
        </div>
      </header>

      <div className="relative z-[102] grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[minmax(248px,280px)_minmax(0,1fr)]">
        {/* STATUS_MONITOR */}
        <aside
          className={cn(
            "tactical-cockpit-aside tactical-chamber-aside relative z-[102] flex min-h-0 flex-col overflow-hidden p-2.5 pl-3 sm:p-3 sm:pl-4 lg:max-h-full lg:pl-5",
            "max-lg:max-h-[min(52dvh,420px)] max-lg:overflow-y-auto max-lg:overscroll-contain",
            "max-lg:border-b max-lg:border-cyan-500/15",
          )}
        >
          <div className="tactical-cockpit-signal" aria-hidden>
            <span className="tactical-cockpit-signal__label">{ch.signalLabel}</span>
          </div>
          <h2 className="tactical-phosphor mb-1 border-b border-cyan-500/20 pb-1 text-[10px] uppercase tracking-[0.28em] text-cyan-400/75 sm:text-[11px]">
            ┃ {ch.statusMonitor}
          </h2>
          <p className="mb-1.5 line-clamp-2 text-[9px] leading-snug text-cyan-300/70">{ch.protocolStackLabel}</p>

          {invalidCollection && (
            <div className="tactical-alert-critical relative z-0 mb-4 px-3 py-3">
              <p className="relative z-[1] text-center text-[10px] font-bold uppercase tracking-wider text-red-200">
                ⚠ {ch.invalidCollectionTitle}
              </p>
              <p className="relative z-[1] mt-2 text-center text-[9px] text-red-100/85">
                {ch.invalidCollectionBody.replace("{id}", String(collectionId))}
              </p>
            </div>
          )}

          {systemDesync && (
            <div className="tactical-frame mb-3 border-orange-500/50 bg-orange-950/30 p-2.5 shadow-[0_0_16px_rgba(251,146,60,0.12)]">
              <p className="text-center text-[9px] uppercase tracking-wide text-orange-300 tactical-phosphor">
                ⚠ {ch.nodeDesyncTitle}
              </p>
              <button
                type="button"
                onClick={() => {
                  playTacticalUiClick()
                  rebootProcess()
                }}
                className="tactical-interactive-glitch tactical-btn mt-2 w-full py-1.5 text-[9px] uppercase tracking-widest text-orange-200"
              >
                <span>⟲ {ch.rebootProcess}</span>
              </button>
            </div>
          )}

          {lowEnergy && address && !phased && !invalidCollection && (
            <div className="tactical-frame mb-2 border-amber-500/50 bg-amber-950/25 px-2.5 py-1.5 shadow-[0_0_18px_rgba(245,158,11,0.12)]">
              <p className="text-center text-[10px] font-bold uppercase tracking-wider text-amber-300 tactical-phosphor">
                ⚡ {ch.lowEnergyTitle}
              </p>
              <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1 text-center text-[10px] text-amber-200/80">
                <span>{ch.reqLiqPrefix}</span>{" "}
                <span className="tactical-digits-7seg text-amber-200/95">{stroopsToLiqDisplay(effectivePriceStroops)}</span>{" "}
                <PhaserLiqTokenLink
                  href={expertUrl}
                  symbol={chainTokenSymbol}
                  variant="amber"
                  iconClassName="h-3.5 w-3.5"
                  className="text-[10px]"
                />
              </p>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto text-[12px] leading-snug lg:overflow-y-auto">
            <div className="mb-2 space-y-2 border-b border-cyan-900/40 pb-2">
              <dl className="space-y-2">
                <div>
                  <dt className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{ch.wallet}</dt>
                  <dd className="mt-1.5 break-all text-[13px] text-foreground/90">
                    {address ? truncateAddress(address) : ch.offline}
                  </dd>
                </div>
                {address ? (
                  <div>
                    <dt className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {lang === "es" ? "Artista" : "Artist"}
                    </dt>
                    <dd className="mt-1.5 text-[13px] text-cyan-300/90">
                      {artistAlias ?? (lang === "es" ? "Sin alias" : "No alias")}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="mb-2 space-y-2 border-b border-cyan-900/40 pb-2">
              <dl className="space-y-2">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{ch.liqBalance}</dt>
                  <dd className={cn("mt-1", lowEnergy && "text-amber-400", balanceGlitch && "tactical-balance-glitch")}>
                    <span className="tactical-digits-7seg text-lg tabular-nums tracking-tight text-cyan-100 sm:text-xl">
                      {formatLiq(tokenBalance)}
                    </span>{" "}
                    <PhaserLiqTokenLink
                      href={expertUrl}
                      symbol={chainTokenSymbol}
                      className="align-middle text-xs text-cyan-500/90"
                    />
                    <p className="mt-1 text-[8px] leading-snug tracking-wide text-cyan-500/50">{ch.tokenStandardSep41Note}</p>
                  </dd>
                </div>
                {classicAsset && (
                  <>
                    <div>
                      <dt className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{ch.classicAssetLabel}</dt>
                      <dd className="mt-1.5 text-[13px] text-foreground/80">
                        {classicAsset.code} · {truncateAddress(classicAsset.issuer)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{ch.freighterBalanceLabel}</dt>
                      <dd className="mt-1.5 font-mono text-sm tabular-nums text-cyan-300/95">
                        {classicStatus?.hasTrustline ? (classicStatus.balance ?? "0.0000000") : "NO_TRUSTLINE"}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            <div className="mb-2 space-y-2 border-b border-cyan-900/40 pb-2">
              <dl className="space-y-2">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{ch.collectionId}</dt>
                  <dd className="mt-1 text-[12px] tabular-nums text-foreground/85">
                    {collectionId > 0 ? String(collectionId) : ch.collectionIdProtocol}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{ch.x402Price}</dt>
                  <dd className="tactical-phosphor mt-1 text-cyan-300">
                    <span className="tactical-digits-7seg text-lg tabular-nums tracking-tight sm:text-xl">
                      {stroopsToLiqDisplay(effectivePriceStroops)}
                    </span>{" "}
                    <PhaserLiqTokenLink
                      href={expertUrl}
                      symbol={chainTokenSymbol}
                      className="align-middle text-xs text-cyan-500/80"
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{ch.network}</dt>
                  <dd className="mt-1 text-[12px] text-foreground/85">{ch.networkValue}</dd>
                </div>
              </dl>
            </div>

            <div className="mb-2 space-y-2 pb-1">
              <dl className="space-y-2">
                <div>
                  <dt className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{ch.phaseState}</dt>
                  <dd className="mt-1.5 text-[13px]">
                    {phased ? (
                      <span className="text-green-400">
                        {ch.nftMinted} // #{phaseId}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{ch.liquid}</span>
                    )}
                  </dd>
                </div>
                {phased && energyLevelBp != null && (
                  <div>
                    <dt className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{ch.powerLevel}</dt>
                    <dd className="mt-1.5 font-mono text-sm tabular-nums text-cyan-400/95">
                      {(energyLevelBp / 100).toFixed(0)}% <span className="text-muted-foreground">({energyLevelBp} bp)</span>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {!address ? (
            <button
              type="button"
              disabled={connecting}
              onClick={() => {
                playTacticalUiClick()
                void handleConnect().catch(() => {})
              }}
              className="tactical-interactive-glitch tactical-btn tactical-phosphor mt-2.5 w-full py-2.5 text-[9px] uppercase tracking-widest text-cyan-200 disabled:opacity-50"
            >
              <span>
                {connecting ? `◌ ${ch.uplinking}` : `▣ ${ch.linkWallet}`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                playTacticalUiClick()
                disconnect()
                appendLog(ch.logs.walletUnlink)
                void refreshStatus().catch(() => {})
                void refreshClassicStatus().catch(() => {})
              }}
              className="tactical-interactive-glitch tactical-btn mt-2.5 w-full border-red-500/30 py-2 text-[9px] uppercase tracking-widest text-red-400/80 hover:border-red-500/60"
            >
              <span>◇ {ch.disconnect}</span>
            </button>
          )}

          {address && classicAsset && classicEnabled && !classicStatus?.hasTrustline ? (
            <button
              type="button"
              disabled={classicBusy}
              onClick={() => {
                playTacticalUiClick()
                void enableClassicAssetTrustline().catch(() => {})
              }}
              className="tactical-interactive-glitch tactical-btn mt-2 w-full border-cyan-400/55 py-2 text-[9px] uppercase tracking-widest text-cyan-200 disabled:opacity-50"
            >
              {classicBusy
                ? lang === "es"
                  ? "ACTIVANDO_TRUSTLINE..."
                  : "ENABLING_TRUSTLINE..."
                : lang === "es"
                  ? "[ ACTIVAR_ASSET_EN_FREIGHTER ]"
                  : "[ ENABLE_ASSET_IN_FREIGHTER ]"}
            </button>
          ) : null}

          {address && classicAsset && classicEnabled && classicStatus?.hasTrustline && !classicFundedAt ? (
            <button
              type="button"
              disabled={classicBusy}
              onClick={() => {
                playTacticalUiClick()
                void requestClassicBootstrap().catch(() => {})
              }}
              className="tactical-interactive-glitch tactical-btn mt-2 w-full border-emerald-500/55 py-2 text-[9px] uppercase tracking-widest text-emerald-200 disabled:opacity-50"
            >
              {classicBusy
                ? lang === "es"
                  ? "FONDEANDO_ASSET..."
                  : "FUNDING_ASSET..."
                : lang === "es"
                  ? `[ FONDEAR_ASSET_CLASICO +${classicBootstrapAmount || "0"} ]`
                  : `[ FUND_CLASSIC_ASSET +${classicBootstrapAmount || "0"} ]`}
            </button>
          ) : null}

          {address ? (
            <div className="mt-3 shrink-0 rounded border border-cyan-900/50 bg-black/40 p-2">
              <ArtistAliasControl compact />
            </div>
          ) : null}

          {isCreatorCurrentCollection ? (
            <div className="tactical-frame mt-2 border-cyan-400/35 bg-cyan-950/25 px-2.5 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-cyan-200">{ch.creatorCanMint}</p>
              <p className="mt-1 text-[10px] text-cyan-200/80">
                {phased ? ch.creatorAlreadyMinted : ch.creatorMintRule}
              </p>
            </div>
          ) : null}
        </aside>

        {/* THE_REACTOR */}
        <main className="tactical-cockpit-stage relative z-[102] flex h-full min-h-0 flex-col items-stretch overflow-hidden overflow-x-hidden max-lg:border-b max-lg:border-cyan-500/15">
          <div
            className="pointer-events-none absolute inset-2 rounded-lg bg-gradient-to-b from-cyan-500/[0.045] to-transparent shadow-[inset_0_1px_0_rgba(34,211,238,0.05)] sm:inset-3"
            aria-hidden
          />

          <div className="tactical-cockpit-stage__content relative flex h-full min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-4">
          {/* Exhibition pedestal — NFT de utilidad PHASE (Soroban) */}
          <div className="relative z-10 mx-auto mb-0 flex min-h-0 w-full max-w-[min(76rem,100%)] flex-1 flex-col">
            <p className="tactical-phosphor mb-0.5 shrink-0 text-center text-[10px] uppercase tracking-[0.32em] text-cyan-500/60 sm:text-[11px]">
              ◈ {ch.exhibitionPedestal}
            </p>
            <p className="mb-1 shrink-0 text-center text-[9px] uppercase tracking-[0.24em] text-cyan-400/85 tactical-phosphor sm:text-[10px]">
              {collectionPedestalLine}
            </p>
            <div className="tactical-frame flex min-h-[min(10vh,88px)] max-h-[min(30dvh,240px)] flex-1 flex-col items-stretch gap-1.5 overflow-y-auto rounded-xl border border-cyan-500/18 bg-[oklch(0.055_0.02_220)]/90 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08),inset_0_0_48px_rgba(0,0,0,0.5)] sm:min-h-[min(12vh,104px)] sm:max-h-[min(32dvh,280px)] sm:gap-2 sm:px-4 sm:py-3">
              {mintingArtifact ? (
                <div className="text-center">
                  <div className="mx-auto mb-2 h-12 w-12 border-2 border-cyan-500/60 border-t-transparent animate-spin rounded-full" />
                  <p className="animate-pulse text-sm font-bold uppercase tracking-[0.2em] text-cyan-400">
                    {ch.mintingTitle}
                  </p>
                  <p className="mt-2 text-[9px] uppercase tracking-widest text-muted-foreground">
                    {ch.committingLedger}
                  </p>
                </div>
              ) : phased && phaseId != null && address ? (
                <div className="flex w-full max-h-full min-h-0 flex-col items-center gap-2 overflow-y-auto sm:gap-3">
                  <p className="mb-0.5 shrink-0 text-center text-[8px] uppercase tracking-[0.35em] text-muted-foreground">
                    {ch.artifactAsciiView}
                  </p>
                  <PhaseArtifactVisualizer
                    mode="verified"
                    contractId={TOKEN_ADDRESS}
                    ownerTruncated={
                      onChainTokenOwner ? truncateAddress(onChainTokenOwner) : truncateAddress(address)
                    }
                    serial={phaseId}
                    energyLevelBp={energyLevelBp ?? 10_000}
                    collectionTitle={artifactCollectionTitle}
                    collectionDisplayName={artifactPublicCollectionName}
                    imageUrl={
                      effectiveArtifactImage ? ipfsOrHttpsDisplayUrl(effectiveArtifactImage) : undefined
                    }
                    labels={ch.artifact}
                    viewerAddress={address}
                    isOwner={isOwnerOnChain}
                    authenticityPending={authenticityPending}
                    supplyMinted={collectionSupply?.minted ?? null}
                    supplyCap={collectionSupply?.cap ?? null}
                    onAccessPrivateMetadata={
                      isOwnerOnChain ? () => void handleAccessPrivateMetadata().catch(() => {}) : undefined
                    }
                  />
                  <p className="text-center text-[9px] uppercase tracking-[0.25em] text-accent/80">{ch.onChainMeta}</p>
                  <div className="w-full max-w-[min(100%,28rem)] rounded border border-cyan-500/35 bg-cyan-950/20 px-3 py-2">
                    <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                      {ch.freighterManualAddTitle}
                    </p>
                    <p className="mt-1 text-center text-[11px] text-cyan-100/80">{ch.freighterManualAddBody}</p>
                  </div>
                </div>
              ) : collectionLoadState === "loading" && collectionId > 0 ? (
                <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
                  {ch.syncingMeta}
                </p>
              ) : (
                <div className="flex w-full max-h-full min-h-0 flex-col items-center gap-2 overflow-y-auto sm:gap-3">
                  <div className="tactical-frame w-full shrink-0 px-3 py-2 text-center shadow-[0_0_16px_rgba(0,255,255,0.08)]">
                    <p className="text-[8px] uppercase tracking-[0.35em] text-cyan-500/55">{ch.x402MintPrice}</p>
                    <p className="tactical-phosphor mt-0.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xl tracking-wider text-cyan-200 sm:text-2xl">
                      <span className="tactical-digits-7seg">{stroopsToLiqDisplay(effectivePriceStroops)}</span>
                      <PhaserLiqTokenLink
                        href={expertUrl}
                        symbol={chainTokenSymbol}
                        iconClassName="h-4 w-4 sm:h-5 sm:w-5"
                        className="text-sm sm:text-base"
                      />
                    </p>
                    {collectionId > 0 && collectionInfo && (
                      <p className="mt-2 text-[9px] uppercase tracking-widest text-muted-foreground/80">
                        {ch.collectionLine
                          .replace("{id}", String(collectionId))
                          .replace("{name}", collectionInfo.name || "—")}
                      </p>
                    )}
                    {collectionId === 0 && (
                      <p className="mt-2 text-[9px] uppercase tracking-widest text-muted-foreground/80">
                        {ch.protocolDefaultPool}
                      </p>
                    )}
                  </div>
                  <p className="text-center text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
                    {ch.artifactAsciiView}
                  </p>
                  <PhaseArtifactVisualizer
                    mode={artifactVerificationMode === "verifying" ? "verifying" : "locked"}
                    contractId={TOKEN_ADDRESS}
                    ownerTruncated={address ? truncateAddress(address) : ch.offline}
                    serial={0}
                    energyLevelBp={0}
                    collectionTitle={artifactCollectionTitle}
                    collectionDisplayName={artifactPublicCollectionName}
                    imageUrl={collectionPreviewImgSrc || undefined}
                    labels={ch.artifact}
                    viewerAddress={address}
                    supplyMinted={collectionSupply?.minted ?? null}
                    supplyCap={collectionSupply?.cap ?? null}
                  />
                </div>
              )}
            </div>
          </div>

          <p className="tactical-phosphor mb-0.5 mt-1 shrink-0 text-center text-[10px] uppercase tracking-[0.36em] text-cyan-500/55 sm:text-[11px]">
            ◇ {ch.theReactor}
          </p>

          {!phased ? (
            <div
              className={cn(
                "relative z-10 mx-auto flex w-full max-w-[min(52rem,100%)] shrink-0 flex-col items-stretch gap-1.5 px-1 sm:px-2",
                genesisLoading && "tactical-reactor-filling",
              )}
            >
              <button
                type="button"
                disabled={
                  !address ||
                  processing ||
                  genesisLoading ||
                  invalidCollection ||
                  collectionLoadState === "loading" ||
                  (!canInitializeGenesisSupply && lowEnergy)
                }
                onClick={() => {
                  playTacticalUiClick()
                  if (canInitializeGenesisSupply) {
                    void requestGenesisSupply().catch(() => {})
                    return
                  }
                  void initiateX402().catch(() => {})
                }}
                className={cn(
                  "tactical-interactive-glitch tactical-btn tactical-btn-x402 relative py-2.5 text-xs uppercase tracking-[0.18em] sm:py-3 sm:text-sm",
                  (!canInitializeGenesisSupply && (lowEnergy || !address))
                    ? "cursor-not-allowed opacity-40"
                    : "text-cyan-100 tactical-btn-x402--armed",
                  processing && x402Tx === "busy" && "tactical-btn-x402--streaming",
                )}
              >
                <span className="tactical-x402-label px-2 text-base font-bold tracking-widest sm:text-lg md:text-xl">
                  {genesisLoading
                    ? `▶▶ ${ch.genesisSupplyLoading}`
                    : processing && x402Tx === "busy"
                      ? `▶▶ ${ch.x402StreamActive}`
                      : canInitializeGenesisSupply
                        ? ch.initializeGenesisSupply
                        : `▣ ${ch.executeSettlement}`}
                </span>
              </button>
            </div>
          ) : (
            <p className="tactical-phosphor-green relative z-10 text-center text-[10px] uppercase tracking-widest text-[#39ff14]/90">
              ● {ch.solidStateStandby}
            </p>
          )}

          {address ? (
            <LiquidityFaucetControl
              address={address}
              tokenBalance={tokenBalance}
              onNarrativeLog={appendLog}
              onRefreshBalance={refreshStatus}
              compact
              className="relative z-10 mx-auto mt-1.5 w-full max-w-[min(52rem,100%)] px-0 sm:mt-2"
            />
          ) : null}

          <div className="relative z-10 mt-2 w-full min-h-0 max-w-[min(52rem,100%)] shrink-0 border-t border-cyan-500/15 pt-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="tactical-phosphor text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300/90">
                ▣ {ch.community}
              </p>
              <Link
                href="/dashboard"
                className="tactical-phosphor shrink-0 rounded border border-cyan-500/45 bg-cyan-950/30 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100 hover:border-cyan-300 hover:text-white"
              >
                {ch.fullMarket}
              </Link>
            </div>
            {catalogLoadState === "loading" && (
              <p className="text-[10px] font-medium uppercase tracking-widest text-cyan-400/80">{ch.catalogLoading}</p>
            )}
            {catalogLoadState === "done" && communityCatalog.length === 0 && (
              <p className="mb-3 text-[10px] leading-relaxed text-cyan-200/75">
                {ch.noCommunity}{" "}
                <Link href="/forge" className="font-bold text-cyan-300 underline-offset-2 hover:text-white hover:underline">
                  {ch.forgeCta}
                </Link>
                .
              </p>
            )}
            {catalogLoadState === "done" && (
              <div className="flex max-h-[4rem] max-w-full gap-1.5 overflow-x-auto overflow-y-hidden pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin]">
                <Link
                  href="/chamber"
                  className={cn(
                    "tactical-frame flex w-[4.75rem] shrink-0 flex-col bg-black/50 transition-shadow",
                    collectionId === 0
                      ? "shadow-[0_0_16px_rgba(0,255,255,0.28)]"
                      : "opacity-90 hover:shadow-[0_0_12px_rgba(0,255,255,0.12)]",
                  )}
                  title={ch.defaultPool}
                >
                  <div className="flex aspect-square items-center justify-center border-b border-foreground/15 bg-[oklch(0.05_0_0)]">
                    <span className="px-1 text-center text-[8px] font-bold uppercase tracking-widest text-cyan-300/90">
                      #0
                    </span>
                  </div>
                  <div className="px-1 py-1.5 text-center">
                    <p className="truncate text-[7px] font-semibold uppercase tracking-tighter text-cyan-200/95">
                      {ch.defaultPool}
                    </p>
                    <p className="truncate text-[6px] font-medium leading-tight text-cyan-400/85">
                      <span className="inline-flex items-center justify-center gap-1">
                        {stroopsToLiqDisplay(REQUIRED_AMOUNT)} <TokenIcon className="h-3 w-3" /> {chainTokenSymbol}
                      </span>
                    </p>
                  </div>
                </Link>
                {communityCatalog
                  .slice()
                  .sort((a, b) => a.collectionId - b.collectionId)
                  .map((c) => {
                    const active = c.collectionId === collectionId
                    const thumb = c.imageUri?.trim() ? ipfsOrHttpsDisplayUrl(c.imageUri) : ""
                    return (
                      <Link
                        key={c.collectionId}
                        href={`/chamber?collection=${c.collectionId}`}
                        className={cn(
                          "tactical-frame flex w-[4.75rem] shrink-0 flex-col bg-black/50 transition-shadow",
                          active
                            ? "shadow-[0_0_16px_rgba(0,255,255,0.28)]"
                            : "opacity-90 hover:shadow-[0_0_12px_rgba(0,255,255,0.12)]",
                        )}
                        title={c.name || `Collection #${c.collectionId}`}
                      >
                        <div className="flex aspect-square items-center justify-center border-b border-foreground/15 bg-[oklch(0.05_0_0)]">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="px-1 text-center text-[7px] uppercase leading-tight text-muted-foreground/45">
                              #{c.collectionId}
                            </span>
                          )}
                        </div>
                        <div className="px-1 py-1.5 text-center">
                          <p className="truncate text-[7px] uppercase tracking-tighter text-cyan-400/90">#{c.collectionId}</p>
                          {creatorAliasByWallet[c.creator] ? (
                            <p className="truncate text-[6px] uppercase tracking-tighter text-cyan-300/90">
                              @{creatorAliasByWallet[c.creator]}
                            </p>
                          ) : null}
                          <p className="truncate text-[6px] leading-tight text-muted-foreground/70">
                            <span className="inline-flex items-center gap-1">
                              {stroopsToLiqDisplay(c.price)} <TokenIcon className="h-3 w-3" /> {chainTokenSymbol}
                            </span>
                          </p>
                        </div>
                      </Link>
                    )
                  })}
              </div>
            )}
          </div>
          </div>
        </main>

      </div>

      {logsOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[140] cursor-default border-0 bg-black/50 p-0"
            aria-label={ch.logsClose}
            onClick={() => setLogsOpen(false)}
          />
          <div
            id="chamber-logs-panel"
            role="dialog"
            aria-modal="true"
            aria-label={ch.systemLogs}
            className="fixed bottom-3 left-1/2 z-[150] w-[min(20rem,calc(100vw-1.25rem))] max-w-[20rem] -translate-x-1/2 md:left-auto md:right-4 md:translate-x-0"
          >
            <div
              className={cn(
                "tactical-frame-panel flex max-h-[min(42vh,260px)] flex-col overflow-hidden border-2 border-[#39ff14]/45 bg-black/95 shadow-[0_12px_40px_rgba(0,0,0,0.75)] backdrop-blur-sm",
              )}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-green-500/25 px-2.5 py-1.5">
                <h2 className="tactical-phosphor-green text-[9px] uppercase tracking-[0.35em] text-[#39ff14]/75">
                  ┃ {ch.systemLogs}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="tactical-phosphor-green text-[8px] text-[#39ff14]/80">● {ch.live}</span>
                  <button
                    type="button"
                    onClick={() => setLogsOpen(false)}
                    className="rounded border border-cyan-500/45 px-2 py-0.5 font-mono text-[11px] leading-none text-cyan-300 hover:bg-cyan-950/60"
                    aria-label={ch.logsClose}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="tactical-log-viewport tactical-log-viewport--analog min-h-[7rem] flex-1 overflow-y-auto px-2 py-2 pr-1 text-[9px] leading-[1.45] text-[#5eead4]/92">
                {lines.map((l, i) => {
                  const fault = /FAIL|Failed|ERROR|FAULT|ABORT|REJECT|denied|timeout|sequence|desync/i.test(l.text)
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        !fault && "tactical-log-line mb-1 border-l-2 border-[#39ff14]/25 pl-2 font-mono",
                        fault && "tactical-log-emergency font-mono",
                      )}
                      style={!fault ? { animationDelay: `${Math.min(i, 8) * 65}ms` } : undefined}
                    >
                      {l.text}
                    </div>
                  )
                })}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
