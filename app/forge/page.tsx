"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { signTransaction } from "@stellar/freighter-api"
import { ArtistAliasControl } from "@/components/artist-alias-control"
import { LangToggle } from "@/components/lang-toggle"
import { useLang } from "@/components/lang-context"
import { TokenIcon } from "@/components/token-icon"
import { useWallet } from "@/components/wallet-provider"
import { pickCopy } from "@/lib/phase-copy"
import { composeImageWithPhaseForgeSeal } from "@/lib/forge-seal-image"
import { isIpfsUploadConfigured, uploadToIPFS } from "@/lib/ipfs-upload"
import { cn } from "@/lib/utils"
import { playTacticalUiClick } from "@/lib/tactical-ui-click"
import { LiquidityFaucetControl } from "@/components/liquidity-faucet-control"
import { TacticalCornerSigil } from "@/components/tactical-corner-sigil"
import {
  NETWORK_PASSPHRASE,
  REQUIRED_AMOUNT,
  buildCreateCollectionTransaction,
  buildSettleTransaction,
  fetchCreatorCollectionId,
  getTokenBalance,
  getTransactionResult,
  ipfsOrHttpsDisplayUrl,
  isCreatorAlreadyHasCollectionError,
  liqToStroops,
  sendTransaction,
  stroopsToLiqDisplay,
  PHASER_LIQ_SYMBOL,
  stellarExpertPhaserLiqUrl,
  validateFinalContractImageUri,
} from "@/lib/phase-protocol"

function truncateAddress(addr: string) {
  if (!addr || addr.length < 14) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function captureWheelOnRewardsPanel(e: React.WheelEvent<HTMLDivElement>) {
  const el = e.currentTarget
  if (el.scrollHeight <= el.clientHeight + 1) return
  const { scrollTop, scrollHeight, clientHeight } = el
  const dy = e.deltaY
  const atTop = scrollTop <= 0
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1
  if ((dy < 0 && !atTop) || (dy > 0 && !atBottom)) {
    e.stopPropagation()
  }
}

const PHASER_LIQ_EXPERT_HREF = stellarExpertPhaserLiqUrl()

function PhaserLiqExpertLink({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <a
      href={PHASER_LIQ_EXPERT_HREF}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${PHASER_LIQ_SYMBOL} — Stellar Expert (testnet)`}
      className={cn(
        "inline-flex items-center gap-1 font-semibold text-cyan-100 underline decoration-cyan-400/55 underline-offset-[3px] transition-colors hover:text-white hover:decoration-cyan-200",
        className,
      )}
    >
      {children ?? PHASER_LIQ_SYMBOL}
      <span className="text-[0.65em] font-normal opacity-80" aria-hidden>
        ↗
      </span>
    </a>
  )
}

function textWithPhaserLiqLinks(text: string): React.ReactNode {
  if (!text.includes(PHASER_LIQ_SYMBOL)) return text
  const parts = text.split(PHASER_LIQ_SYMBOL)
  return parts.map((part, i) => (
    <span key={`frag-${i}`}>
      {part}
      {i < parts.length - 1 ? <PhaserLiqExpertLink key={`liq-${i}`} /> : null}
    </span>
  ))
}

const forgeNavBtn =
  "tactical-interactive-glitch tactical-phosphor inline-flex min-h-[40px] items-center rounded-sm border-2 border-cyan-400/50 bg-cyan-950/45 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.14)] transition-colors hover:border-cyan-300 hover:bg-cyan-900/35 hover:text-white"

type AgentState = "IDLE" | "AWAITING_PAYMENT" | "PROCESSING_PAYMENT" | "FORGING_MATTER" | "COMPLETE"
type ForgeMode = "ORACLE" | "MANUAL"

const PROTOCOL_HALTED = "[ PROTOCOL_HALTED: ERROR_IN_FUSION_CHAMBER ]"

export default function ForgePage() {
  const { lang } = useLang()
  const f = pickCopy(lang).forge
  const n = pickCopy(lang).nav

  const { address, connect, disconnect, connecting, refresh, artistAlias } = useWallet()

  const [name, setName] = useState("")
  const [priceLiq, setPriceLiq] = useState("1")
  const [anomalyDescription, setAnomalyDescription] = useState("")
  const [forgeMode, setForgeMode] = useState<ForgeMode>("ORACLE")
  const [manualFile, setManualFile] = useState<File | null>(null)
  const [manualImageUrl, setManualImageUrl] = useState("")
  const [manualLoreDraft, setManualLoreDraft] = useState("")
  const [manualPreviewObjectUrl, setManualPreviewObjectUrl] = useState<string | null>(null)
  const [manualDropActive, setManualDropActive] = useState(false)
  const manualFileInputRef = useRef<HTMLInputElement>(null)

  const [agentState, setAgentState] = useState<AgentState>("IDLE")
  const [isMintingCollection, setIsMintingCollection] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [tickerIdx, setTickerIdx] = useState(0)
  const [agentTickerIdx, setAgentTickerIdx] = useState(0)
  const [ipfsConfigured, setIpfsConfigured] = useState<boolean | null>(null)
  const [tokenBalance, setTokenBalance] = useState("0")

  const [agentImageUrl, setAgentImageUrl] = useState<string | null>(null)
  const [lore, setLore] = useState<string | null>(null)

  const agentFlowBusy =
    agentState === "AWAITING_PAYMENT" ||
    agentState === "PROCESSING_PAYMENT" ||
    agentState === "FORGING_MATTER"

  const busy = isMintingCollection || agentFlowBusy

  const anomalyFieldLocked = agentFlowBusy || agentState === "COMPLETE"
  const namePriceLocked =
    (forgeMode === "ORACLE" && (agentFlowBusy || agentState === "COMPLETE")) || isMintingCollection

  const tabSwitchLocked = agentFlowBusy || isMintingCollection

  useEffect(() => {
    if (!manualFile) {
      setManualPreviewObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(manualFile)
    setManualPreviewObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [manualFile])

  const selectForgeMode = useCallback(
    (next: ForgeMode) => {
      if (next === forgeMode || tabSwitchLocked) return
      playTacticalUiClick()
      setError(null)
      if (next === "MANUAL") {
        setAgentState("IDLE")
        setAgentImageUrl(null)
        setLore(null)
      } else {
        setManualFile(null)
        setManualImageUrl("")
        setManualLoreDraft("")
      }
      setForgeMode(next)
    },
    [forgeMode, tabSwitchLocked],
  )

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

  useEffect(() => {
    if (!isMintingCollection) return
    const tickers = f.deployTickers
    const id = window.setInterval(() => {
      setTickerIdx((i) => (i + 1) % tickers.length)
    }, 900)
    return () => window.clearInterval(id)
  }, [isMintingCollection, f.deployTickers])

  useEffect(() => {
    if (agentState !== "FORGING_MATTER") return
    const tickers = [
      "[ SYSTEM: AGENT_PROCESSING... COMPILING_LORE... ]",
      "[ SYSTEM: AGENT_PROCESSING... SYNTHESIZING_VISUAL_MATTER... ]",
    ]
    const id = window.setInterval(() => {
      setAgentTickerIdx((i) => (i + 1) % tickers.length)
    }, 700)
    return () => window.clearInterval(id)
  }, [agentState])

  const previewSrc = useMemo(() => {
    if (forgeMode === "MANUAL") {
      if (manualPreviewObjectUrl) return manualPreviewObjectUrl
      const t = manualImageUrl.trim()
      if (t) return ipfsOrHttpsDisplayUrl(t)
      return ""
    }
    return agentImageUrl ? ipfsOrHttpsDisplayUrl(agentImageUrl) : ""
  }, [forgeMode, manualPreviewObjectUrl, manualImageUrl, agentImageUrl])

  const previewLoreText = forgeMode === "MANUAL" ? manualLoreDraft.trim() : (lore ?? "")

  const resolveImageUriForMint = useCallback(
    async (openAiImageUrl: string): Promise<string> => {
      const ivm = pickCopy(lang).imageValidation
      let res: Response
      try {
        res = await fetch(openAiImageUrl)
      } catch {
        throw new Error(pickCopy(lang).forge.errors.fetchAgentImage)
      }
      if (!res.ok) throw new Error(pickCopy(lang).forge.errors.fetchAgentImage)
      const blob = await res.blob()
      const sealed = await composeImageWithPhaseForgeSeal(blob)

      const configured = await isIpfsUploadConfigured().catch(() => false)
      if (configured) {
        const uri = await uploadToIPFS(sealed)
        const v = validateFinalContractImageUri(uri, ivm)
        if (!v.ok) throw new Error(v.message)
        return v.value
      }

      const vOpen = validateFinalContractImageUri(openAiImageUrl.trim(), ivm)
      if (vOpen.ok) return vOpen.value
      throw new Error(pickCopy(lang).forge.errors.finalUri)
    },
    [lang],
  )

  const resolveManualFileForMint = useCallback(
    async (file: File): Promise<string> => {
      const ivm = pickCopy(lang).imageValidation
      const sealed = await composeImageWithPhaseForgeSeal(file)
      const configured = await isIpfsUploadConfigured().catch(() => false)
      if (configured) {
        const uri = await uploadToIPFS(sealed)
        const v = validateFinalContractImageUri(uri, ivm)
        if (!v.ok) throw new Error(v.message)
        return v.value
      }
      throw new Error(pickCopy(lang).forge.errors.finalUri)
    },
    [lang],
  )

  const runCreateCollectionTransaction = useCallback(
    async (
      finalUri: string,
      opts: { restoreOracleOnFail: boolean; clearManualOnSuccess: boolean },
    ) => {
      const ff = pickCopy(lang).forge
      const addr = address ?? (await refresh())
      if (!addr) {
        setError(ff.errors.connectWallet)
        return
      }
      const trimmedName = name.trim()
      if (trimmedName.length < 2) {
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

      setIsMintingCollection(true)
      setTickerIdx(0)

      try {
        const txEnvelopeCreate = await buildCreateCollectionTransaction(addr, trimmedName, stroops, finalUri)
        const signCreate = await signTransaction(txEnvelopeCreate, {
          networkPassphrase: NETWORK_PASSPHRASE,
          address: addr,
        })
        if (signCreate.error) throw new Error(signCreate.error.message || "SIGN_FAIL")
        const signedCreate =
          (signCreate as { signedTxXdr?: string }).signedTxXdr ||
          (signCreate as { signedTransaction?: string }).signedTransaction
        if (!signedCreate) throw new Error("NO_SIGNED_XDR")
        const sendCreate = await sendTransaction(signedCreate)
        await getTransactionResult(sendCreate.hash as string)

        const id = await fetchCreatorCollectionId(addr)
        if (id == null) throw new Error(ff.errors.collectionIdRead)
        setCreatedId(id)
        if (typeof window !== "undefined") {
          const path = `/chamber?collection=${id}`
          setShareUrl(`${window.location.origin}${path}`)
        }
        setAgentState("IDLE")
        if (opts.clearManualOnSuccess) {
          setManualFile(null)
          setManualImageUrl("")
          setManualLoreDraft("")
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (opts.restoreOracleOnFail) setAgentState("COMPLETE")
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
        setError(PROTOCOL_HALTED)
      } finally {
        setIsMintingCollection(false)
      }
    },
    [address, lang, name, priceLiq, refresh],
  )

  const initiateAgentForge = useCallback(
    async (userPrompt: string, payerAddress: string): Promise<{ imageUrl: string; lore: string }> => {
      const ff = pickCopy(lang).forge
      setAgentState("AWAITING_PAYMENT")

      const probe = await fetch("/api/forge-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt }),
      })

      if (probe.status !== 402) {
        const errText = await probe.text().catch(() => "")
        if (probe.ok) throw new Error(ff.errors.agentNot402)
        throw new Error(errText || ff.errors.agentRequest)
      }

      const challengeBody = (await probe.json().catch(() => ({}))) as {
        challenge?: { amount?: number | string }
      }
      const requiredAmount = String(challengeBody.challenge?.amount ?? REQUIRED_AMOUNT)

      setAgentState("PROCESSING_PAYMENT")
      const invoiceId = Math.floor(Math.random() * 1_000_000)
      const txEnvelope = await buildSettleTransaction(payerAddress, requiredAmount, invoiceId, 0)
      const signResult = await signTransaction(txEnvelope, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: payerAddress,
      })
      if (signResult.error) {
        throw new Error("FUSION_ABORTED_BY_USER")
      }
      const signedXdr =
        (signResult as { signedTxXdr?: string }).signedTxXdr ||
        (signResult as { signedTransaction?: string }).signedTransaction
      if (!signedXdr) throw new Error("NO_SIGNED_XDR")

      const sendResult = await sendTransaction(signedXdr)
      await getTransactionResult(sendResult.hash as string)
      await refreshLiqBalance().catch(() => {})

      setAgentState("FORGING_MATTER")
      setAgentTickerIdx(0)

      const hash = sendResult.hash as string
      const x402Proof = btoa(JSON.stringify({ settlementTxHash: hash, payerAddress }))

      const paid = await fetch("/api/forge-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `x402 ${x402Proof}`,
        },
        body: JSON.stringify({
          prompt: userPrompt,
          settlementTxHash: hash,
          payerAddress,
        }),
      })

      if (paid.status >= 500) {
        throw new Error("ORACLE_OFFLINE_ENERGY_CONSUMED")
      }
      if (!paid.ok) {
        const t = await paid.text().catch(() => "")
        throw new Error(t || ff.errors.agentRequest)
      }

      const data = (await paid.json()) as {
        success?: boolean
        imageUrl?: string
        lore?: string
        description?: string
      }
      if (!data.imageUrl) throw new Error(ff.errors.agentRequest)

      const loreText = data.lore ?? data.description ?? ""
      setAgentImageUrl(data.imageUrl)
      setLore(loreText)
      setAgentState("COMPLETE")
      return { imageUrl: data.imageUrl, lore: loreText }
    },
    [lang, refreshLiqBalance],
  )

  const handleForgeAgent = useCallback(async () => {
    const ff = pickCopy(lang).forge
    setError(null)
    setShareUrl(null)
    setCreatedId(null)
    setCopied(false)
    setAgentImageUrl(null)
    setLore(null)
    setAgentState("IDLE")

    const addr = address ?? (await refresh())
    if (!addr) {
      setError(ff.errors.connectWallet)
      return
    }

    const prompt = anomalyDescription.trim()
    if (prompt.length < 4) {
      setError(ff.errors.anomalyShort)
      return
    }

    try {
      const bal = await getTokenBalance(addr)
      if (BigInt(bal) < BigInt(REQUIRED_AMOUNT)) {
        setError(ff.errors.lowEnergyAgent)
        return
      }
    } catch {
      setError(ff.errors.lowEnergyAgent)
      return
    }

    try {
      await initiateAgentForge(prompt, addr)
    } catch {
      setAgentState("IDLE")
      setAgentImageUrl(null)
      setLore(null)
      setError(PROTOCOL_HALTED)
    }
  }, [address, anomalyDescription, initiateAgentForge, lang, refresh])

  const handleMintArtifact = useCallback(async () => {
    if (agentState !== "COMPLETE" || !agentImageUrl) return
    setError(null)
    try {
      const finalUri = await resolveImageUriForMint(agentImageUrl)
      await runCreateCollectionTransaction(finalUri, {
        restoreOracleOnFail: true,
        clearManualOnSuccess: false,
      })
    } catch {
      setError(PROTOCOL_HALTED)
    }
  }, [agentImageUrl, agentState, resolveImageUriForMint, runCreateCollectionTransaction])

  const handleManualUploadAndMint = useCallback(async () => {
    if (forgeMode !== "MANUAL") return
    const ff = pickCopy(lang).forge
    setError(null)
    let finalUri: string
    try {
      if (manualFile) {
        finalUri = await resolveManualFileForMint(manualFile)
      } else if (manualImageUrl.trim()) {
        finalUri = await resolveImageUriForMint(manualImageUrl.trim())
      } else {
        setError(ff.errors.manualNoImage)
        return
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || PROTOCOL_HALTED)
      return
    }
    await runCreateCollectionTransaction(finalUri, {
      restoreOracleOnFail: false,
      clearManualOnSuccess: true,
    })
  }, [
    forgeMode,
    lang,
    manualFile,
    manualImageUrl,
    resolveImageUriForMint,
    resolveManualFileForMint,
    runCreateCollectionTransaction,
  ])

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
    "tactical-cockpit-forge-shell tactical-frame relative flex min-h-full min-w-0 flex-col p-4 text-cyan-100 md:p-6",
    isMintingCollection && "forge-shell--deploying tactical-btn-forge-primary",
  )

  const inputClass =
    "tactical-frame w-full border-cyan-500/35 bg-black/55 px-3 py-2.5 text-[15px] leading-snug text-cyan-50 placeholder:text-cyan-500/40 focus:border-cyan-400/70 focus:outline-none focus:shadow-[0_0_16px_rgba(0,255,255,0.12)]"

  const textareaClass = cn(
    inputClass,
    "min-h-[11rem] resize-y font-mono text-[13px] leading-relaxed sm:min-h-[13rem] sm:text-sm",
  )

  const inputLabelClass =
    "text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/90 tactical-phosphor sm:text-[11px]"

  const priceReadout = stroopsToLiqDisplay(liqToStroops(priceLiq))

  const forgingTerminalLines = [
    "[ SYSTEM: AGENT_PROCESSING... COMPILING_LORE... ]",
    "[ SYSTEM: AGENT_PROCESSING... SYNTHESIZING_VISUAL_MATTER... ]",
  ] as const

  const statusStripActive =
    forgeMode === "ORACLE" ? agentFlowBusy || isMintingCollection : isMintingCollection

  const statusLine = isMintingCollection
    ? f.deployTickers[tickerIdx % f.deployTickers.length]
    : agentState === "PROCESSING_PAYMENT"
      ? "[ x402_PAYMENT_REQUIRED // AWAITING_SIGNATURE ]"
      : agentState === "FORGING_MATTER"
        ? forgingTerminalLines[agentTickerIdx % forgingTerminalLines.length]
        : agentState === "AWAITING_PAYMENT"
          ? "[ CONTACTING_ORACLE... ]"
          : ""

  const initiatePrimaryLabel =
    agentState === "IDLE"
      ? "[ INITIATE_AGENT_PROTOCOL ]"
      : agentState === "AWAITING_PAYMENT"
        ? "[ CONTACTING_ORACLE... ]"
        : agentState === "PROCESSING_PAYMENT"
          ? "[ x402_PAYMENT_REQUIRED // AWAITING_SIGNATURE ]"
          : agentState === "FORGING_MATTER"
            ? forgingTerminalLines[agentTickerIdx % forgingTerminalLines.length]
            : "[ INITIATE_AGENT_PROTOCOL ]"

  return (
    <div className="tactical-command-root tactical-command-root--stable tactical-command-root--cockpit relative flex h-screen max-h-[100dvh] flex-col overflow-x-hidden overflow-y-hidden font-mono text-foreground antialiased">
      <div className="tactical-film-grain" aria-hidden />
      <div className="tactical-crt-veil" aria-hidden />
      <div className="tactical-crt-fine" aria-hidden />
      <TacticalCornerSigil className="pointer-events-none fixed bottom-2 left-2 z-50 hidden opacity-70 sm:block" />

      <header className="tactical-header-bar relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link href="/" className={forgeNavBtn} onClick={() => playTacticalUiClick()}>
          {f.exit}
        </Link>
        <span className="tactical-phosphor max-w-[min(52vw,18rem)] text-center text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-50 sm:text-xs">
          {f.title}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <LangToggle variant="phosphor" />
          <Link href="/dashboard" className={forgeNavBtn} onClick={() => playTacticalUiClick()}>
            {n.market}
          </Link>
          <Link href="/chamber" className={forgeNavBtn} onClick={() => playTacticalUiClick()}>
            {n.chamber}
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto min-h-0 w-full max-w-[100rem] flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 pb-3 pt-1 md:px-5 [-webkit-overflow-scrolling:touch]">
        <div className={shellClass}>
          {statusStripActive && (
            <div className="shrink-0">
              <div className="forge-scanline" aria-hidden />
              <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 text-[9px] uppercase tracking-widest text-[#00ffff]">
                <span className="forge-status-led inline-block size-2 rounded-full bg-[#00ffff]" />
                {isMintingCollection ? f.deployStatus : f.agentDeployStatus}
              </div>
              <p
                className={cn(
                  "mb-2 border-b border-[#00ffff]/30 pb-2 font-mono text-[9px] uppercase tracking-[0.18em]",
                  agentState === "PROCESSING_PAYMENT" && "forge-x402-blink",
                  agentState === "FORGING_MATTER" && "forge-forge-glitch text-[#00ffff]/90",
                  (agentState === "AWAITING_PAYMENT" || isMintingCollection) && "text-[#00ffff]/90",
                )}
              >
                {statusLine}
              </p>
            </div>
          )}

          {!statusStripActive && (
            <h1 className="tactical-phosphor shrink-0 border-b border-cyan-500/30 pb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-50 sm:text-xs">
              ◈ {f.registerTitle}
            </h1>
          )}

          {!statusStripActive && (
            <div
              className="mt-2 flex w-full max-w-xl gap-0 border border-cyan-900/50 bg-black/35"
              role="tablist"
              aria-label="Forge mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={forgeMode === "ORACLE"}
                disabled={tabSwitchLocked}
                onClick={() => selectForgeMode("ORACLE")}
                className={cn(
                  "min-h-[40px] flex-1 rounded-none border-0 px-2 py-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] transition-colors sm:px-3 sm:text-[10px]",
                  forgeMode === "ORACLE"
                    ? "bg-cyan-950/50 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45),0_0_16px_rgba(34,211,238,0.1)]"
                    : "bg-transparent text-cyan-900/95 hover:bg-cyan-950/25 hover:text-cyan-700",
                  tabSwitchLocked && "opacity-50",
                )}
              >
                {f.tabOracle}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={forgeMode === "MANUAL"}
                disabled={tabSwitchLocked}
                onClick={() => selectForgeMode("MANUAL")}
                className={cn(
                  "min-h-[40px] flex-1 rounded-none border-l border-cyan-900/50 px-2 py-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] transition-colors sm:px-3 sm:text-[10px]",
                  forgeMode === "MANUAL"
                    ? "bg-cyan-950/50 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45),0_0_16px_rgba(34,211,238,0.1)]"
                    : "bg-transparent text-cyan-900/95 hover:bg-cyan-950/25 hover:text-cyan-700",
                  tabSwitchLocked && "opacity-50",
                )}
              >
                {f.tabManual}
              </button>
            </div>
          )}

          {!statusStripActive && (
            <p className="mt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-cyan-400/90">
              {forgeMode === "ORACLE" ? f.oracleBadge : f.manualBadge}
            </p>
          )}

          {!statusStripActive && (
            <p className="mt-2 line-clamp-6 shrink-0 text-[10px] leading-relaxed text-cyan-100/90 tactical-phosphor sm:text-[11px]">
              {forgeMode === "ORACLE" ? f.intro : f.manualIntro}
            </p>
          )}

          {ipfsConfigured === false && (
            <div className="tactical-frame mt-2 shrink-0 border-amber-500/40 bg-amber-950/15 px-2 py-2 text-[9px] text-amber-100/90">
              <p className="font-mono uppercase tracking-widest text-amber-300/95">{f.ipfsOracleHint}</p>
            </div>
          )}

          {error && (
            <div className="tactical-alert-critical relative z-[1] mt-2 shrink-0 px-2 py-2" role="alert">
              <p className="relative z-[1] text-center text-[9px] font-bold uppercase tracking-wider text-red-200">{error}</p>
            </div>
          )}

          {shareUrl && createdId != null && (
            <div className="custom-scrollbar mt-2 max-h-36 shrink-0 overflow-y-auto border-2 border-[#00ffff]/55 bg-[#00ffff]/5 p-2 text-[9px]">
              <p className="font-bold uppercase tracking-[0.15em] text-cyan-200">{f.collectionLive}</p>
              <p className="mt-1 font-mono text-[11px] text-cyan-50">
                {f.collectionIdLabel} <span className="text-cyan-300">#{createdId}</span>
              </p>
              <p className="mt-1 font-semibold uppercase tracking-widest text-cyan-400/80">{f.magicLink}</p>
              <a
                href={shareUrl}
                className="mt-1 block break-all rounded border border-[#00ffff]/25 bg-black/30 px-2 py-1 text-[9px] text-[#7fffd4] underline-offset-2 hover:underline"
              >
                {shareUrl}
              </a>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyShare().catch(() => {})}
                  className="inline-flex flex-1 items-center justify-center border-2 border-double border-[#00ffff]/80 px-3 py-2 text-[9px] uppercase tracking-widest text-[#00ffff] hover:bg-[#00ffff]/10 sm:flex-none"
                >
                  {copied ? f.copied : f.copy}
                </button>
                <Link
                  href={`/chamber?collection=${createdId}`}
                  className="inline-flex flex-1 items-center justify-center border-2 border-double border-cyan-400/55 bg-cyan-950/25 px-3 py-2 text-center text-[9px] font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-900/35 sm:flex-none"
                >
                  {f.openChamber}
                </Link>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
            <div className="flex w-full flex-col gap-2 lg:col-span-5">
              <div className="custom-scrollbar space-y-3 pr-0.5 lg:pr-0">
                {forgeMode === "ORACLE" ? (
                  <div>
                    <label htmlFor="forge-anomaly" className={inputLabelClass}>
                      {f.anomalyLabel}
                    </label>
                    <textarea
                      id="forge-anomaly"
                      value={anomalyDescription}
                      onChange={(e) => setAnomalyDescription(e.target.value)}
                      disabled={anomalyFieldLocked}
                      placeholder={f.placeholders.anomaly}
                      rows={6}
                      className={cn(textareaClass, "mt-1")}
                      autoComplete="off"
                      spellCheck={lang === "es"}
                    />
                    <p className="mt-1 text-[9px] leading-relaxed text-cyan-400/75 sm:text-[10px]">{f.oracleHint}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input
                      ref={manualFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      aria-hidden
                      tabIndex={-1}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file?.type.startsWith("image/")) setManualFile(file)
                        e.target.value = ""
                      }}
                    />
                    <div>
                      <p className={inputLabelClass}>{f.manualDropLabel}</p>
                      <button
                        type="button"
                        disabled={namePriceLocked}
                        onClick={() => manualFileInputRef.current?.click()}
                        onDragEnter={(e) => {
                          e.preventDefault()
                          setManualDropActive(true)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = "copy"
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault()
                          setManualDropActive(false)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          setManualDropActive(false)
                          const file = e.dataTransfer.files?.[0]
                          if (file?.type.startsWith("image/")) setManualFile(file)
                        }}
                        className={cn(
                          "mt-1 flex min-h-[7.5rem] w-full flex-col items-center justify-center border-2 border-dashed px-3 py-4 text-center transition-colors",
                          manualDropActive
                            ? "border-cyan-400/60 bg-cyan-950/35"
                            : "border-cyan-700/40 bg-black/40 hover:border-cyan-500/45",
                          namePriceLocked && "pointer-events-none opacity-45",
                        )}
                      >
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/90">
                          {manualFile ? manualFile.name : "[ TAP_OR_DROP ]"}
                        </span>
                        <span className="mt-1 text-[8px] uppercase tracking-widest text-cyan-600/90">{f.manualDropHint}</span>
                      </button>
                      {manualFile ? (
                        <button
                          type="button"
                          disabled={namePriceLocked}
                          onClick={() => setManualFile(null)}
                          className="mt-1 font-mono text-[8px] uppercase tracking-widest text-cyan-500/80 underline-offset-2 hover:text-cyan-300"
                        >
                          [ CLEAR_FILE ]
                        </button>
                      ) : null}
                    </div>
                    <div>
                      <label htmlFor="forge-manual-url" className={inputLabelClass}>
                        {f.manualUrlLabel}
                      </label>
                      <input
                        id="forge-manual-url"
                        value={manualImageUrl}
                        onChange={(e) => setManualImageUrl(e.target.value)}
                        disabled={namePriceLocked}
                        placeholder={f.placeholders.manualImageUrl}
                        className={cn(inputClass, "mt-1 font-mono text-[12px]")}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label htmlFor="forge-manual-lore" className={inputLabelClass}>
                        {f.manualLoreLabel}
                      </label>
                      <textarea
                        id="forge-manual-lore"
                        value={manualLoreDraft}
                        onChange={(e) => setManualLoreDraft(e.target.value)}
                        disabled={namePriceLocked}
                        placeholder={f.manualLorePlaceholder}
                        rows={5}
                        className={cn(textareaClass, "mt-1 min-h-[8rem]")}
                        autoComplete="off"
                        spellCheck={lang === "es"}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <label htmlFor="forge-name" className={inputLabelClass}>
                      {f.collectionName}
                    </label>
                    <input
                      id="forge-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={64}
                      disabled={namePriceLocked}
                      placeholder={f.placeholders.collectionName}
                      className={cn(inputClass, "mt-1")}
                    />
                  </div>
                  <div>
                    <label htmlFor="forge-price" className={inputLabelClass}>
                      {textWithPhaserLiqLinks(f.fusionPrice)}
                    </label>
                    <input
                      id="forge-price"
                      value={priceLiq}
                      onChange={(e) => setPriceLiq(e.target.value)}
                      inputMode="decimal"
                      disabled={namePriceLocked}
                      placeholder={f.placeholders.price}
                      className={cn(inputClass, "mt-1")}
                    />
                  </div>
                </div>
                <p className="font-mono text-[11px] tabular-nums tracking-wide text-cyan-200/95 sm:text-xs">
                  <span className="text-cyan-400/90">{f.readout}</span>
                  <span className="mx-2 text-cyan-600/50 select-none" aria-hidden>
                    →
                  </span>
                  <span className="text-cyan-50">{priceReadout}</span>
                  <span className="ml-2 inline-flex items-center">
                    <PhaserLiqExpertLink>
                      <TokenIcon className="h-4 w-4 shrink-0" />
                      {PHASER_LIQ_SYMBOL}
                    </PhaserLiqExpertLink>
                  </span>
                </p>

                {!address ? null : (
                  <div className="space-y-2 border-t border-cyan-900/40 pt-2">
                    <p className="text-[10px] text-cyan-100/90 sm:text-[11px]">
                      {f.walletLabel}: <span className="font-medium text-cyan-50">{truncateAddress(address)}</span>
                    </p>
                    <p className="text-[10px] text-cyan-200/88 sm:text-[11px]">
                      {lang === "es" ? "Artista" : "Artist"}:{" "}
                      <span className="font-medium text-cyan-100">{artistAlias ?? (lang === "es" ? "sin alias" : "no alias")}</span>
                    </p>
                    <div className="rounded border border-cyan-900/50 bg-black/40 p-2">
                      <ArtistAliasControl compact />
                    </div>
                    <p className="font-mono text-[11px] tabular-nums text-cyan-200/95 sm:text-xs">
                      <span className="text-cyan-300/90">{pickCopy(lang).chamber.liqBalance}</span>
                      {": "}
                      <span className="text-cyan-50">
                        {(() => {
                          const n = parseInt(tokenBalance, 10) / 10000000
                          return Number.isFinite(n) ? n.toFixed(2) : "0.00"
                        })()}{" "}
                      </span>
                      <PhaserLiqExpertLink />
                    </p>
                  </div>
                )}
              </div>

              {address ? (
                <div
                  className="custom-scrollbar min-h-[12rem] max-h-[min(26rem,55vh)] shrink-0 overflow-y-auto overscroll-y-contain border-t border-cyan-900/50 pt-2 [-webkit-overflow-scrolling:touch]"
                  onWheelCapture={captureWheelOnRewardsPanel}
                >
                  <LiquidityFaucetControl
                    address={address}
                    tokenBalance={tokenBalance}
                    onRefreshBalance={refreshLiqBalance}
                    className="rounded-none border-0 bg-transparent p-2 shadow-none"
                  />
                </div>
              ) : null}

              <div className="shrink-0 space-y-2 border-t border-cyan-900/50 pt-2">
                {!address ? (
                  <button
                    type="button"
                    disabled={connecting}
                    onClick={() => {
                      playTacticalUiClick()
                      void connect()
                        .then(() => refresh())
                        .catch(() => {})
                    }}
                    className="tactical-interactive-glitch w-full border-4 border-double border-[#00ffff]/60 py-2.5 text-[10px] uppercase tracking-widest text-[#00ffff] transition-colors hover:bg-[#00ffff]/10 disabled:opacity-50"
                  >
                    {connecting ? f.linking : f.linkWallet}
                  </button>
                ) : (
                  <>
                    {forgeMode === "MANUAL" ? (
                      <button
                        type="button"
                        disabled={isMintingCollection}
                        onClick={() => {
                          playTacticalUiClick()
                          void handleManualUploadAndMint().catch(() => {})
                        }}
                        className={cn(
                          "tactical-interactive-glitch w-full border-4 border-double border-[#00ffff] bg-[#00ffff]/5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#00ffff] shadow-[0_0_20px_rgba(0,255,255,0.14)] transition-all hover:bg-[#00ffff]/15 hover:shadow-[0_0_28px_rgba(0,255,255,0.2)] disabled:opacity-40 sm:text-[11px]",
                          isMintingCollection && "forge-forge-glitch",
                        )}
                      >
                        {isMintingCollection ? statusLine || f.deploying : f.manualUploadMint}
                      </button>
                    ) : agentState === "COMPLETE" ? (
                      <button
                        type="button"
                        disabled={isMintingCollection}
                        onClick={() => {
                          playTacticalUiClick()
                          void handleMintArtifact().catch(() => {})
                        }}
                        className={cn(
                          "tactical-interactive-glitch w-full border-4 border-double border-[#00ffff] bg-[#00ffff]/5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#00ffff] shadow-[0_0_20px_rgba(0,255,255,0.14)] transition-all hover:bg-[#00ffff]/15 hover:shadow-[0_0_28px_rgba(0,255,255,0.2)] disabled:opacity-40 sm:text-[11px]",
                          isMintingCollection && "forge-forge-glitch",
                        )}
                      >
                        {isMintingCollection ? statusLine || f.deploying : "[ ARTIFACT_READY_FOR_MINT ]"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          playTacticalUiClick()
                          void handleForgeAgent().catch(() => {})
                        }}
                        className={cn(
                          "tactical-interactive-glitch w-full border-4 border-double border-[#00ffff] bg-[#00ffff]/5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#00ffff] shadow-[0_0_20px_rgba(0,255,255,0.14)] transition-all hover:bg-[#00ffff]/15 hover:shadow-[0_0_28px_rgba(0,255,255,0.2)] disabled:opacity-40 sm:text-[11px]",
                          agentState === "PROCESSING_PAYMENT" && "forge-x402-blink",
                          agentState === "FORGING_MATTER" && "forge-forge-glitch",
                        )}
                      >
                        {initiatePrimaryLabel}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        playTacticalUiClick()
                        disconnect()
                        void refresh().catch(() => {})
                      }}
                      className="tactical-interactive-glitch w-full border-2 border-cyan-500/35 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-cyan-400/80 hover:border-red-500/50 hover:text-red-300"
                    >
                      {f.disconnect}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex min-h-[220px] w-full flex-col lg:col-span-7">
              <p className="mb-2 shrink-0 border-b border-cyan-500/35 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.28em] text-cyan-200/95">
                {f.artPreview}
              </p>
              <div className="art-retro-monitor flex min-h-[min(280px,42vh)] flex-col items-center justify-center overflow-hidden px-2 py-2 lg:min-h-[min(360px,50vh)]">
                {previewSrc ? (
                  <div className="tactical-holo-wrap relative z-[3] flex h-full max-h-full w-full max-w-full flex-col items-center justify-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Pollinations / IPFS URLs */}
                    <img
                      src={previewSrc}
                      alt=""
                      className="art-retro-monitor__img tactical-holo-img relative z-[3] max-h-[min(52vh,420px)] max-w-full object-contain"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    {previewLoreText ? (
                      <div className="custom-scrollbar max-h-28 w-full max-w-lg overflow-y-auto border border-cyan-500/25 bg-black/50 px-2 py-1.5 text-left">
                        <p className="text-[8px] font-bold uppercase tracking-widest text-cyan-500/80">{f.lorePreview}</p>
                        <p className="mt-1 whitespace-pre-wrap font-mono text-[10px] leading-snug text-cyan-100/90">
                          {previewLoreText}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <span className="relative z-[3] px-2 text-center font-mono text-[9px] font-medium uppercase leading-relaxed tracking-[0.2em] text-cyan-400/85">
                    {forgeMode === "MANUAL" ? f.manualAwaiting : f.awaitingFeed}
                    <br />
                    <span className="text-[8px] tracking-widest text-cyan-500/70">
                      {forgeMode === "MANUAL" ? f.manualAwaitingHint : f.oracleHint}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
