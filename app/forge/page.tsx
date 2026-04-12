"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { signTransaction } from "@/lib/stellar-wallet-kit"
import { FeeBumpTransaction, Transaction, TransactionBuilder, Networks } from "@stellar/stellar-sdk"
import { ArtistAliasControl } from "@/components/artist-alias-control"
import { LangToggle } from "@/components/lang-toggle"
import { useLang } from "@/components/lang-context"
import { TokenIcon } from "@/components/token-icon"
const TrustlineButton = dynamic(
  () => import("@/components/trustline-button").then((m) => ({ default: m.TrustlineButton })),
  {
    ssr: false,
    loading: () => (
      <section
        className="tactical-frame mt-2 shrink-0 border-cyan-400/35 bg-cyan-950/20 px-2.5 py-2 shadow-[0_0_16px_rgba(34,211,238,0.1)]"
        aria-busy="true"
        aria-label="Trustline"
      >
        <div className="h-2.5 w-40 max-w-full rounded bg-cyan-500/15" />
        <div className="mt-2 h-9 w-full rounded border border-cyan-500/25 bg-cyan-950/30" />
      </section>
    ),
  },
)
import { useWallet } from "@/components/wallet-provider"
import { pickCopy } from "@/lib/phase-copy"
import { humanizePhaseHostErrorMessage } from "@/lib/phase-host-error"
import { composeImageWithPhaseForgeSeal } from "@/lib/forge-seal-image"
import { isIpfsUploadConfigured, uploadToIPFS } from "@/lib/ipfs-upload"
import { cn } from "@/lib/utils"
import { playTacticalUiClick } from "@/lib/tactical-ui-click"
import { IpfsDisplayImg } from "@/components/ipfs-display-img"
import { LiquidityFaucetControl } from "@/components/liquidity-faucet-control"
import { TacticalCornerSigil } from "@/components/tactical-corner-sigil"
import {
  NETWORK_PASSPHRASE,
  REQUIRED_AMOUNT,
  buildCreateCollectionTransaction,
  buildSettleTransaction,
  fetchCreatorCollectionIds,
  fetchUserPhaseArtifact,
  getTokenBalance,
  getTransactionResult,
  liqToStroops,
  sendTransaction,
  stroopsToLiqDisplay,
  PHASER_LIQ_STELLAR_EXPERT_DEFAULT,
  PHASER_LIQ_SYMBOL,
  stellarExpertPhaserLiqUrl,
  validateFinalContractImageUri,
} from "@/lib/phase-protocol"
import { parseSignedTxXdr } from "@/lib/classic-liq"
import { freighterTestnetMismatchLabel } from "@/lib/freighter-testnet"
import { toast } from "sonner"

/** Fallos típicos cuando el RPC público de testnet devuelve 502/503/504 o el proxy agota reintentos. */
function isSorobanRpcCongestionError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : err &&
          typeof err === "object" &&
          typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : String(err)
  const m = msg.toLowerCase()
  return (
    /\b503\b/.test(m) ||
    /\b502\b/.test(m) ||
    /\b504\b/.test(m) ||
    /status code 50[234]/.test(m) ||
    /service unavailable|bad gateway|gateway timeout/.test(m) ||
    /soroban rpc no disponible|no disponible tras reintentos/.test(m) ||
    /el rpc soroban no respondió|el proxy soroban devolvió/.test(m)
  )
}

const SOROBAN_CONGESTED_CODE = "SOROBAN_TESTNET_CONGESTED"

/** Comprueba que el XDR sea una transacción testnet firmable por Freighter (no envía nada a red). */
function assertValidUnsignedSettleXdr(xdr: string): void {
  const trimmed = xdr?.trim() ?? ""
  if (trimmed.length < 48) {
    throw new Error("XDR inválido: demasiado corto para ser una transacción Stellar.")
  }
  try {
    const parsed = TransactionBuilder.fromXDR(trimmed, Networks.TESTNET)
    if (parsed instanceof FeeBumpTransaction) {
      const inner = parsed.innerTransaction
      if (!inner || !(inner instanceof Transaction)) {
        throw new Error("Fee bump sin transacción interna esperada.")
      }
      return
    }
    if (!(parsed instanceof Transaction)) {
      throw new Error("El XDR no decodifica a una transacción estándar.")
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("XDR")) throw e
    if (e instanceof Error && e.message.startsWith("Fee bump")) throw e
    if (e instanceof Error && e.message.startsWith("El XDR")) throw e
    throw new Error(`XDR de settle no válido para testnet: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function truncateAddress(addr: string) {
  if (!addr || addr.length < 14) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Convierte errores técnicos del flujo Oracle/mint en copy localizada o mensaje legible. */
function mapFusionChamberError(
  err: unknown,
  errors: ReturnType<typeof pickCopy>["forge"]["errors"],
): string {
  const msg =
    err instanceof Error
      ? err.message
      : err &&
          typeof err === "object" &&
          typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : String(err)
  switch (msg) {
    case SOROBAN_CONGESTED_CODE:
      return errors.sorobanTestnetCongested
    case "FUSION_ABORTED_BY_USER":
      return errors.userAbortedFreighter
    case "ORACLE_OFFLINE_ENERGY_CONSUMED":
      return errors.oracleOfflineAfterPayment
    case "SIGN_FAIL":
    case "NO_SIGNED_XDR":
      return errors.agentPay
    default:
      break
  }
  const hostMsg = humanizePhaseHostErrorMessage(
    msg,
    errors.phaseHostContractErrors,
    errors.phaseHostContractUnknown,
  )
  if (hostMsg) return hostMsg
  if (msg && (/\s/.test(msg) || /[a-z]/.test(msg))) {
    return msg.length > 450 ? `${msg.slice(0, 450)}…` : msg
  }
  return errors.fusionChamberHalted
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

/**
 * Enlace Stellar Expert: primer render = URL default fija (SSR + hidratación iguales).
 * Tras montar, aplica `stellarExpertPhaserLiqUrl()` (NEXT_PUBLIC_*) para evitar mismatch
 * cuando el servidor ve .env completo y el chunk cliente no inlina igual el emisor.
 */
function PhaserLiqExpertLink({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const [href, setHref] = useState(PHASER_LIQ_STELLAR_EXPERT_DEFAULT)
  useEffect(() => {
    setHref(stellarExpertPhaserLiqUrl())
  }, [])
  return (
    <a
      href={href}
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
  "tactical-interactive-glitch tactical-phosphor inline-flex min-h-[40px] items-center rounded-sm border-2 border-cyan-400/50 bg-cyan-950/45 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.14)] transition-colors hover:border-cyan-300 hover:bg-cyan-900/35 hover:text-white sm:text-xs"

type AgentState =
  | "IDLE"
  | "AWAITING_PAYMENT"
  | "ARMING_SETTLEMENT"
  | "PROCESSING_PAYMENT"
  | "FORGING_MATTER"
  | "COMPLETE"
type ForgeMode = "ORACLE" | "MANUAL"
type OracleImageStyleMode = "adaptive" | "cyber"

export default function ForgePage() {
  const { lang } = useLang()
  const f = pickCopy(lang).forge
  const n = pickCopy(lang).nav

  const { address, connect, disconnect, connecting, refresh, artistAlias } = useWallet()

  const [name, setName] = useState("")
  const [priceLiq, setPriceLiq] = useState("1")
  const [anomalyDescription, setAnomalyDescription] = useState("")
  const [oracleImageStyleMode, setOracleImageStyleMode] = useState<OracleImageStyleMode>("adaptive")
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
  /** Token id del NFT PHASE (`get_user_phase`), no el id de colección — necesario para COLLECT en el panel lateral. */
  const [collectionPhaseTokenId, setCollectionPhaseTokenId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [tickerIdx, setTickerIdx] = useState(0)
  const [agentTickerIdx, setAgentTickerIdx] = useState(0)
  const [ipfsConfigured, setIpfsConfigured] = useState<boolean | null>(null)
  const [tokenBalance, setTokenBalance] = useState("0")
  const [protocolReady, setProtocolReady] = useState(false)

  const [agentImageUrl, setAgentImageUrl] = useState<string | null>(null)
  const [lore, setLore] = useState<string | null>(null)

  const agentFlowBusy =
    agentState === "AWAITING_PAYMENT" ||
    agentState === "ARMING_SETTLEMENT" ||
    agentState === "PROCESSING_PAYMENT" ||
    agentState === "FORGING_MATTER"

  const busy = isMintingCollection || agentFlowBusy
  const actionLockedByProtocol = Boolean(address && !protocolReady)

  const anomalyFieldLocked = agentFlowBusy || agentState === "COMPLETE"
  /** Tras el Oráculo en COMPLETE el usuario aún debe poder editar nombre/precio antes del mint; no bloquear aquí. */
  const namePriceLocked = (forgeMode === "ORACLE" && agentFlowBusy) || isMintingCollection

  const tabSwitchLocked = agentFlowBusy || isMintingCollection

  // On wallet connect, load the most-recently created collection (last in list) for the
  // "Collection Live" panel. Multiple collections are now supported; we show the last one
  // as the active context without blocking the form.
  useEffect(() => {
    const g = address?.trim()
    setCreatedId(null)
    setShareUrl(null)
    if (!g) return
    let cancelled = false
    void fetchCreatorCollectionIds(g).then((ids) => {
      if (cancelled || ids.length === 0) return
      const last = ids[ids.length - 1]
      setCreatedId(last)
      if (typeof window !== "undefined") {
        setShareUrl(`${window.location.origin}/chamber?collection=${last}`)
      }
    })
    return () => {
      cancelled = true
    }
  }, [address])

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
    const g = address?.trim()
    if (!g || createdId == null || createdId <= 0) {
      setCollectionPhaseTokenId(null)
      return
    }
    if (isMintingCollection) {
      setCollectionPhaseTokenId(null)
      return
    }
    let cancelled = false
    void fetchUserPhaseArtifact(g, createdId).then((art) => {
      if (cancelled) return
      const tid = art?.tokenId
      setCollectionPhaseTokenId(typeof tid === "number" && Number.isFinite(tid) && tid > 0 ? Math.floor(tid) : null)
    })
    return () => {
      cancelled = true
    }
  }, [address, createdId, isMintingCollection])

  const onTrustlineRequestConnect = useCallback(async () => {
    await connect()
    return refresh()
  }, [connect, refresh])

  const onTrustlineReady = useCallback(async () => {
    setProtocolReady(true)
    await refreshLiqBalance()
  }, [refreshLiqBalance])

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
      return manualImageUrl.trim()
    }
    return agentImageUrl?.trim() ?? ""
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
      const wrongNet = await freighterTestnetMismatchLabel()
      if (wrongNet) {
        setError(ff.errors.freighterWrongNetwork.replace("{network}", wrongNet))
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

        const ids = await fetchCreatorCollectionIds(addr)
        const id = ids.length > 0 ? ids[ids.length - 1] : null
        if (id == null) throw new Error(ff.errors.collectionIdRead)
        setCreatedId(id)
        if (typeof window !== "undefined") {
          const path = `/chamber?collection=${id}`
          setShareUrl(`${window.location.origin}${path}`)
        }

        // Cada artefacto forjado debe materializarse como NFT: auto-mint en la colección recién creada.
        try {
          const invoiceId = Math.floor(Math.random() * 1_000_000)
          const txEnvelopeMint = await buildSettleTransaction(addr, stroops, invoiceId, id)
          const signMint = await signTransaction(txEnvelopeMint, {
            networkPassphrase: NETWORK_PASSPHRASE,
            address: addr,
          })
          if (signMint.error) throw new Error(signMint.error.message || "SIGN_FAIL")
          const signedMint =
            (signMint as { signedTxXdr?: string }).signedTxXdr ||
            (signMint as { signedTransaction?: string }).signedTransaction
          if (!signedMint) throw new Error("NO_SIGNED_XDR")
          const sendMint = await sendTransaction(signedMint)
          await getTransactionResult(sendMint.hash as string)
        } catch (mintErr) {
          const fallback =
            lang === "es"
              ? "La colección se creó, pero el auto-mint del NFT falló. Abrí Chamber para mintear manualmente."
              : "Collection created, but NFT auto-mint failed. Open Chamber to mint manually."
          const friendly = mapFusionChamberError(mintErr, ff.errors)
          setError(`${fallback} ${friendly}`)
        }

        setAgentState("IDLE")
        if (opts.clearManualOnSuccess) {
          setManualFile(null)
          setManualImageUrl("")
          setManualLoreDraft("")
        }
      } catch (e) {
        if (opts.restoreOracleOnFail) setAgentState("COMPLETE")
        setError(mapFusionChamberError(e, ff.errors))
      } finally {
        setIsMintingCollection(false)
      }
    },
    [address, lang, name, priceLiq, refresh],
  )

  const initiateAgentForge = useCallback(
    async (
      userPrompt: string,
      payerAddress: string,
      imageStyleMode: OracleImageStyleMode,
    ): Promise<{ imageUrl: string; lore: string }> => {
      const ff = pickCopy(lang).forge
      // AWAITING_PAYMENT ya lo fija handleForgeAgent tras validar el prompt.

      const invoiceId = Math.floor(Math.random() * 1_000_000)
      // Mientras llega el 402, armamos en paralelo el settle con el monto cliente (coincide con el challenge en despliegues normales).
      type SpecBuild = { ok: true; xdr: string } | { ok: false; error: unknown }
      const specBuildPromise: Promise<SpecBuild> = buildSettleTransaction(
        payerAddress,
        String(REQUIRED_AMOUNT),
        invoiceId,
        0,
      )
        .then((xdr) => ({ ok: true as const, xdr }))
        .catch((error: unknown) => ({ ok: false as const, error }))

      // 1) Primer POST: solo prompt → el backend responde 402 + challenge x402
      const first = await fetch("/api/forge-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, imageStyleMode }),
      })

      if (first.status !== 402) {
        void specBuildPromise.catch(() => {})
        const errText = await first.text().catch(() => "")
        console.error("[forge-agent] expected 402 Payment Required, got", first.status, errText)
        if (first.ok) throw new Error(ff.errors.agentNot402)
        throw new Error(errText || ff.errors.agentRequest)
      }

      let paymentRequiredJson: {
        challenge?: { amount?: number | string }
        message?: string
        priceDisplay?: string
      }
      try {
        paymentRequiredJson = (await first.json()) as typeof paymentRequiredJson
      } catch (e) {
        void specBuildPromise.catch(() => {})
        console.error("[forge-agent] 402 response body is not valid JSON", e)
        throw new Error(ff.errors.agentRequest)
      }

      const challenge = paymentRequiredJson.challenge
      if (challenge) {
        console.log("[forge-agent] x402 challenge", challenge)
      }

      const requiredStroops = String(challenge?.amount ?? REQUIRED_AMOUNT)

      // 2) Pago on-chain: invoke `settle` en el contrato PHASE (PHASELQ), no transfer de NFT
      setAgentState("ARMING_SETTLEMENT")
      let unsignedXdr: string
      let settleInvoiceId = invoiceId

      try {
        if (requiredStroops !== String(REQUIRED_AMOUNT)) {
          void specBuildPromise.catch(() => {})
          settleInvoiceId = Math.floor(Math.random() * 1_000_000)
          unsignedXdr = await buildSettleTransaction(payerAddress, requiredStroops, settleInvoiceId, 0)
        } else {
          const spec = await specBuildPromise
          if (spec.ok) {
            unsignedXdr = spec.xdr
          } else {
            // eslint-disable-next-line no-console
            console.warn("[forge-agent] build settle especulativo falló, reconstruyendo", spec.error)
            unsignedXdr = await buildSettleTransaction(
              payerAddress,
              requiredStroops,
              settleInvoiceId,
              0,
            )
          }
        }
      } catch (armErr) {
        console.error("[forge-agent] buildSettleTransaction failed (RPC / simulación / contrato)", armErr)
        setAgentState("IDLE")
        if (isSorobanRpcCongestionError(armErr)) {
          const line = pickCopy(lang).forge.errors.sorobanTestnetCongested
          toast.error(line)
          throw new Error(SOROBAN_CONGESTED_CODE)
        }
        throw armErr
      }

      try {
        assertValidUnsignedSettleXdr(unsignedXdr)
      } catch (xdrErr) {
        console.error("[forge-agent] XDR de settle inválido tras buildSettleTransaction", xdrErr)
        setAgentState("IDLE")
        throw xdrErr
      }

      setAgentState("PROCESSING_PAYMENT")
      const tx = {
        kind: "settle_unsigned_xdr",
        xdrLength: unsignedXdr.length,
        xdrPrefix: unsignedXdr.slice(0, 72),
        invoiceId: settleInvoiceId,
        requiredStroops,
        payerPreview: `${payerAddress.slice(0, 6)}…${payerAddress.slice(-4)}`,
      }
      console.log("Transacción armada, solicitando firma en la wallet...", tx)

      const signResult = await signTransaction(unsignedXdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: payerAddress,
      })
      if (signResult.error) {
        console.error("[forge-agent] La wallet rechazó la firma del settle", signResult.error)
        setAgentState("IDLE")
        throw new Error("FUSION_ABORTED_BY_USER")
      }
      const signedXdr =
        parseSignedTxXdr(signResult) ||
        (signResult as { signedTxXdr?: string }).signedTxXdr ||
        (signResult as { signedTransaction?: string }).signedTransaction
      if (!signedXdr) {
        console.error("[forge-agent] No signed XDR returned from wallet", signResult)
        setAgentState("IDLE")
        throw new Error("NO_SIGNED_XDR")
      }

      const sendResult = await sendTransaction(signedXdr)
      const txHash = sendResult.hash as string
      if (!txHash) {
        console.error("[forge-agent] sendTransaction returned no hash", sendResult)
        throw new Error(ff.errors.agentPay)
      }
      await getTransactionResult(txHash)
      await refreshLiqBalance().catch(() => {})

      setAgentState("FORGING_MATTER")
      setAgentTickerIdx(0)

      // 3) Segundo POST: prueba en body + header `x402` (base64 JSON) como en app/api/forge-agent/route.ts
      const secondBody = {
        prompt: userPrompt,
        settlementTxHash: txHash,
        payerAddress,
        imageStyleMode,
      }
      const phaseProofB64 = btoa(
        JSON.stringify({ settlementTxHash: txHash, payerAddress }),
      )
      const paid = await fetch("/api/forge-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `x402 ${phaseProofB64}`,
        },
        body: JSON.stringify(secondBody),
      })

      const paidRaw = await paid.text().catch(() => "")
      if (paid.status >= 500) {
        console.error("[forge-agent] second POST server error", paid.status, paidRaw)
        let serverMessage = ""
        try {
          const j = JSON.parse(paidRaw) as { error?: unknown; detail?: unknown }
          const errStr = typeof j.error === "string" ? j.error.trim() : ""
          const detailStr = typeof j.detail === "string" ? j.detail.trim() : ""
          if (errStr) serverMessage = detailStr ? `${errStr} — ${detailStr}` : errStr
          else if (detailStr) serverMessage = detailStr
        } catch {
          serverMessage = paidRaw
        }
        throw new Error(serverMessage || "ORACLE_OFFLINE_ENERGY_CONSUMED")
      }
      if (!paid.ok) {
        console.error("[forge-agent] second POST failed after payment", paid.status, paidRaw)
        let failMsg = paidRaw.trim() || ff.errors.agentRequest
        try {
          const j = JSON.parse(paidRaw) as { error?: string; message?: string }
          if (typeof j.error === "string" && j.error.trim()) failMsg = j.error.trim()
          else if (typeof j.message === "string" && j.message.trim()) failMsg = j.message.trim()
        } catch {
          /* cuerpo no JSON */
        }
        throw new Error(failMsg)
      }

      let data: {
        success?: boolean
        imageUrl?: string
        lore?: string
        description?: string
      }
      try {
        data = JSON.parse(paidRaw) as typeof data
      } catch (e) {
        console.error("[forge-agent] second POST success body is not JSON", e, paidRaw)
        throw new Error(ff.errors.agentRequest)
      }
      if (!data.imageUrl) {
        console.error("[forge-agent] success payload missing imageUrl", data)
        throw new Error(ff.errors.agentRequest)
      }

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
    if (!protocolReady) {
      setError(ff.oracle_blocked_msg)
      return
    }

    if (!addr) {
      setError(ff.errors.connectWallet)
      return
    }

    const prompt = anomalyDescription.trim()
    if (prompt.length < 4) {
      setError(ff.errors.anomalyShort)
      return
    }

    // Feedback inmediato: el usuario ve actividad mientras RPC + Freighter API corren en paralelo.
    setAgentState("AWAITING_PAYMENT")

    try {
      const [wrongNet, bal] = await Promise.all([
        freighterTestnetMismatchLabel(),
        getTokenBalance(addr),
      ])
      if (wrongNet) {
        setAgentState("IDLE")
        setError(ff.errors.freighterWrongNetwork.replace("{network}", wrongNet))
        return
      }
      if (BigInt(bal) < BigInt(REQUIRED_AMOUNT)) {
        setAgentState("IDLE")
        setError(ff.errors.lowEnergyAgent)
        return
      }
    } catch (e) {
      setAgentState("IDLE")
      const msg = e instanceof Error ? e.message : String(e)
      if (
        /503|502|504|429|timeout|timed out|RPC|proxy|Soroban|disponible|status code|network|ECONNRESET|fetch failed/i.test(
          msg,
        )
      ) {
        setError(ff.errors.rpcBalanceCheckFailed)
      } else {
        setError(ff.errors.lowEnergyAgent)
      }
      return
    }

    try {
      await initiateAgentForge(prompt, addr, oracleImageStyleMode)
    } catch (e) {
      console.error("[forge] Oracle / x402 flow failed", e)
      setAgentState("IDLE")
      setAgentImageUrl(null)
      setLore(null)
      setError(mapFusionChamberError(e, ff.errors))
    }
  }, [address, anomalyDescription, initiateAgentForge, lang, oracleImageStyleMode, protocolReady, refresh])

  const handleMintArtifact = useCallback(async () => {
    const ff = pickCopy(lang).forge
    if (agentState !== "COMPLETE" || !agentImageUrl) return
    setError(null)
    try {
      const finalUri = await resolveImageUriForMint(agentImageUrl)
      await runCreateCollectionTransaction(finalUri, {
        restoreOracleOnFail: true,
        clearManualOnSuccess: false,
      })
    } catch (e) {
      setError(mapFusionChamberError(e, ff.errors))
    }
  }, [agentImageUrl, agentState, lang, resolveImageUriForMint, runCreateCollectionTransaction])

  const handleManualUploadAndMint = useCallback(async () => {
    const ff = pickCopy(lang).forge
    if (!protocolReady) {
      setError(ff.mint_blocked_msg)
      return
    }

    const wrongNetManual = await freighterTestnetMismatchLabel()
    if (wrongNetManual) {
      setError(ff.errors.freighterWrongNetwork.replace("{network}", wrongNetManual))
      return
    }

    if (forgeMode !== "MANUAL") return
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
      setError(msg ? mapFusionChamberError(e, ff.errors) : ff.errors.fusionChamberHalted)
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
    protocolReady,
  ])

  useEffect(() => {
    setProtocolReady(false)
  }, [address])

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
    "tactical-cockpit-forge-shell tactical-frame relative flex min-h-full min-w-0 w-full flex-col p-4 text-cyan-100 md:p-6",
    isMintingCollection && "forge-shell--deploying tactical-btn-forge-primary",
  )

  const inputClass =
    "tactical-frame w-full border-cyan-500/35 bg-black/55 px-3 py-2.5 text-[16px] leading-snug text-cyan-50 placeholder:text-cyan-500/40 focus:border-cyan-400/70 focus:outline-none focus:shadow-[0_0_16px_rgba(0,255,255,0.12)]"

  const textareaClass = cn(
    inputClass,
    "min-h-[8.25rem] resize-y font-mono text-[14px] leading-relaxed sm:min-h-[9.25rem] sm:text-[15px]",
  )

  const inputLabelClass =
    "text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200/90 tactical-phosphor sm:text-[12px]"

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
      : agentState === "ARMING_SETTLEMENT"
        ? "[ x402 // SOROBAN_PREPARE_SETTLE — RPC… ]"
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
        : agentState === "ARMING_SETTLEMENT"
          ? "[ x402 // PREPARING_SETTLE_TX… ]"
          : agentState === "PROCESSING_PAYMENT"
            ? "[ x402_PAYMENT_REQUIRED // AWAITING_SIGNATURE ]"
            : agentState === "FORGING_MATTER"
              ? forgingTerminalLines[agentTickerIdx % forgingTerminalLines.length]
              : "[ INITIATE_AGENT_PROTOCOL ]"

  const showCollectionLivePanel = shareUrl != null && createdId != null

  const forgeUx = useMemo(() => {
    const hasManualAsset = Boolean(manualFile || manualImageUrl.trim())
    const oracle = forgeMode === "ORACLE"
    const manual = forgeMode === "MANUAL"
    const muteRings = isMintingCollection

    const oracleStep1 = oracle && agentState === "IDLE" && !isMintingCollection
    const oracleStep2 = oracle && agentState === "COMPLETE" && !isMintingCollection
    const oraclePipelineBusy =
      oracle &&
      (agentState === "AWAITING_PAYMENT" ||
        agentState === "ARMING_SETTLEMENT" ||
        agentState === "PROCESSING_PAYMENT" ||
        agentState === "FORGING_MATTER")

    const manualStep1 = manual && !hasManualAsset && !isMintingCollection && !namePriceLocked
    const manualStep2 = manual && hasManualAsset && !isMintingCollection && !namePriceLocked

    const railCurrent: 1 | 2 =
      oracle
        ? agentState === "COMPLETE" || isMintingCollection
          ? 2
          : 1
        : hasManualAsset || isMintingCollection
          ? 2
          : 1

    const railStepAClass = cn(
      "forge-ux-rail__step",
      railCurrent === 2 && "forge-ux-rail__step--done",
      railCurrent === 1 && oraclePipelineBusy && "forge-ux-rail__step--processing",
      railCurrent === 1 && !oraclePipelineBusy && "forge-ux-rail__step--current",
    )
    const railStepBClass = cn("forge-ux-rail__step", railCurrent === 2 && "forge-ux-rail__step--current")

    const oracleSourceRing = cn(
      "forge-field-ring",
      !muteRings && oracleStep1 && "forge-field-ring--active",
      (muteRings || !oracleStep1) && "forge-field-ring--dim",
    )
    const manualSourceRing = cn(
      "forge-field-ring",
      !muteRings && manualStep1 && "forge-field-ring--active",
      (muteRings || !manualStep1) && "forge-field-ring--dim",
    )
    const collectionRing = cn(
      "forge-field-ring mt-1",
      !muteRings && (oracleStep2 || manualStep2) && "forge-field-ring--active",
      ((!muteRings && (oracleStep1 || manualStep1)) || muteRings) && "forge-field-ring--dim",
    )

    const initiateGlow =
      oracle && agentState === "IDLE" && !isMintingCollection && anomalyDescription.trim().length >= 4
    const mintOracleGlow = oracle && agentState === "COMPLETE" && !isMintingCollection
    const mintManualGlow = manual && hasManualAsset && !isMintingCollection

    return {
      hasManualAsset,
      oracleStep1,
      oracleStep2,
      oraclePipelineBusy,
      manualStep1,
      manualStep2,
      railCurrent,
      railStepAClass,
      railStepBClass,
      oracleSourceRing,
      manualSourceRing,
      collectionRing,
      initiateGlow,
      mintOracleGlow,
      mintManualGlow,
    }
  }, [
    forgeMode,
    agentState,
    isMintingCollection,
    manualFile,
    manualImageUrl,
    namePriceLocked,
    anomalyDescription,
  ])

  return (
    <div className="tactical-command-root tactical-command-root--stable tactical-command-root--cockpit relative flex h-screen max-h-[100dvh] flex-col overflow-x-hidden overflow-y-hidden font-mono text-foreground antialiased">
      <div className="tactical-film-grain" aria-hidden />
      <div className="tactical-crt-veil" aria-hidden />
      <div className="tactical-crt-fine" aria-hidden />
      <TacticalCornerSigil className="pointer-events-none fixed bottom-2 left-2 z-50 hidden opacity-70 sm:block" />

      <header className="tactical-header-bar relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2 md:px-5">
        <Link href="/" className={forgeNavBtn} onClick={() => playTacticalUiClick()}>
          {f.exit}
        </Link>
        <span className="tactical-phosphor max-w-[min(52vw,18rem)] text-center text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-50 sm:text-sm">
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

      <main className="custom-scrollbar relative z-10 min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-2 pb-2 pt-0.5 md:px-4 [-webkit-overflow-scrolling:touch]">
        <div className={shellClass}>
          {statusStripActive && (
            <div className="shrink-0">
              <div className="forge-scanline" aria-hidden />
              <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#00ffff]">
                <span className="forge-status-led inline-block size-2 rounded-full bg-[#00ffff]" />
                {isMintingCollection ? f.deployStatus : f.agentDeployStatus}
              </div>
              <p
                className={cn(
                  "mb-2 border-b border-[#00ffff]/30 pb-2 font-mono text-[10px] uppercase tracking-[0.18em]",
                  agentState === "PROCESSING_PAYMENT" && "forge-x402-blink",
                  agentState === "FORGING_MATTER" && "forge-forge-glitch text-[#00ffff]/90",
                  (agentState === "AWAITING_PAYMENT" ||
                    agentState === "ARMING_SETTLEMENT" ||
                    isMintingCollection) &&
                    "text-[#00ffff]/90",
                )}
              >
                {statusLine}
              </p>
            </div>
          )}

          {!statusStripActive && (
            <h1 className="tactical-phosphor shrink-0 border-b border-cyan-500/30 pb-2 text-[12px] font-bold uppercase tracking-[0.22em] text-cyan-50 sm:text-sm">
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
                  "min-h-[40px] flex-1 rounded-none border-0 px-2 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors sm:px-3 sm:text-[11px]",
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
                  "min-h-[40px] flex-1 rounded-none border-l border-cyan-900/50 px-2 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors sm:px-3 sm:text-[11px]",
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
            <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/90">
              {forgeMode === "ORACLE" ? f.oracleBadge : f.manualBadge}
            </p>
          )}

          {!statusStripActive && (
            <p className="mt-1.5 line-clamp-4 shrink-0 text-[10px] leading-relaxed text-cyan-100/90 tactical-phosphor sm:text-[11px]">
              {forgeMode === "ORACLE" ? f.intro : f.manualIntro}
            </p>
          )}

          {!statusStripActive && (
            <div
              className="forge-ux-rail mt-2 max-w-xl"
              role="navigation"
              aria-label={lang === "es" ? "Pasos de forja" : "Forge steps"}
            >
              <span className={forgeUx.railStepAClass}>
                {forgeMode === "ORACLE" ? f.uxRailStepAOracle : f.uxRailStepAManual}
              </span>
              <span className="forge-ux-rail__sep" aria-hidden>
                —
              </span>
              <span className={forgeUx.railStepBClass}>{f.uxRailStepB}</span>
            </div>
          )}

          {ipfsConfigured === false && (
            <div className="tactical-frame mt-2 shrink-0 border-violet-500/40 bg-violet-950/15 px-2 py-2 text-[10px] text-violet-100/90">
              <p className="font-mono uppercase tracking-widest text-violet-300/95">{f.ipfsOracleHint}</p>
            </div>
          )}

          <TrustlineButton
            address={address}
            onRequestConnect={onTrustlineRequestConnect}
            onReady={onTrustlineReady}
          />

          {error && (
            <div className="forge-error-banner relative z-[1] mt-2 shrink-0 px-2 py-2" role="alert">
              <p className="relative z-[1] text-center text-[10px] font-bold uppercase tracking-wider text-red-200">{error}</p>
            </div>
          )}

          {showCollectionLivePanel && (
            <div className="mt-2 shrink-0 border-2 border-[#00ffff]/55 bg-[#00ffff]/5 p-2 text-[10px]">
              <p className="font-bold uppercase tracking-[0.15em] text-cyan-200">{f.collectionLive}</p>
              <p className="mt-1 font-mono text-[12px] text-cyan-50">
                {f.collectionIdLabel} <span className="text-cyan-300">#{createdId}</span>
              </p>
              <p className="mt-1 font-semibold uppercase tracking-widest text-cyan-400/80">{f.magicLink}</p>
              <a
                href={shareUrl}
                className="mt-1 block break-all rounded border border-[#00ffff]/25 bg-black/30 px-2 py-1 text-[10px] text-[#7fffd4] underline-offset-2 hover:underline"
              >
                {shareUrl}
              </a>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyShare().catch(() => {})}
                  className="inline-flex flex-1 items-center justify-center border-2 border-double border-[#00ffff]/80 px-3 py-2 text-[10px] uppercase tracking-widest text-[#00ffff] hover:bg-[#00ffff]/10 sm:flex-none"
                >
                  {copied ? f.copied : f.copy}
                </button>
                <Link
                  href={`/chamber?collection=${createdId}`}
                  className="inline-flex flex-1 items-center justify-center border-2 border-double border-cyan-400/55 bg-cyan-950/25 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-900/35 sm:flex-none"
                >
                  {f.openChamber}
                </Link>
              </div>
            </div>
          )}

          <div className="mt-2.5 flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:gap-5 lg:items-start">
            <div className="flex w-full flex-col gap-1.5 lg:col-span-5">
              <div className="custom-scrollbar space-y-3 pr-0.5 lg:pr-0">
                {forgeMode === "ORACLE" ? (
                  <div className={forgeUx.oracleSourceRing}>
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
                    <p className="mt-1 text-[10px] leading-relaxed text-cyan-400/75 sm:text-[11px]">{f.oracleHint}</p>
                    <div className="mt-2">
                      <label htmlFor="forge-style-mode" className={inputLabelClass}>
                        {lang === "es" ? "Modo de estilo IA" : "AI style mode"}
                      </label>
                      <select
                        id="forge-style-mode"
                        value={oracleImageStyleMode}
                        onChange={(e) => setOracleImageStyleMode(e.target.value as OracleImageStyleMode)}
                        disabled={anomalyFieldLocked}
                        className={cn(inputClass, "mt-1 font-mono text-[12px] uppercase tracking-[0.12em]")}
                      >
                        <option value="adaptive">
                          {lang === "es" ? "ADAPTIVE // RESPETA_TU_IDEA" : "ADAPTIVE // RESPECT_YOUR_PROMPT"}
                        </option>
                        <option value="cyber">{lang === "es" ? "AI_CYBER // ESTILO_PHASE" : "AI_CYBER // PHASE_STYLE"}</option>
                      </select>
                      <p className="mt-1 text-[10px] leading-relaxed text-cyan-400/75 sm:text-[11px]">
                        {oracleImageStyleMode === "cyber"
                          ? lang === "es"
                            ? "AI Cyber aplica estética cyber-brutalist/isométrica."
                            : "AI Cyber applies cyber-brutalist/isometric aesthetics."
                          : lang === "es"
                            ? "Adaptive prioriza tu descripción sin forzar estilo cyber."
                            : "Adaptive prioritizes your description without forcing cyber style."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={cn("space-y-3", forgeUx.manualSourceRing)}>
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
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200/90">
                          {manualFile ? manualFile.name : "[ TAP_OR_DROP ]"}
                        </span>
                        <span className="mt-1 text-[9px] uppercase tracking-widest text-cyan-600/90">{f.manualDropHint}</span>
                      </button>
                      {manualFile ? (
                        <button
                          type="button"
                          disabled={namePriceLocked}
                          onClick={() => setManualFile(null)}
                          className="mt-1 font-mono text-[9px] uppercase tracking-widest text-cyan-500/80 underline-offset-2 hover:text-cyan-300"
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
                        className={cn(inputClass, "mt-1 font-mono text-[13px]")}
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
                        rows={4}
                        className={cn(textareaClass, "mt-1 min-h-[6.5rem]")}
                        autoComplete="off"
                        spellCheck={lang === "es"}
                      />
                    </div>
                  </div>
                )}

                <div className={cn("space-y-2", forgeUx.collectionRing)}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    <div>
                      <label htmlFor="forge-name" className={inputLabelClass}>
                        {f.collectionName}
                      </label>
                      <input
                        id="forge-name"
                        value={name}
                        onChange={(e) => {
                          const v = e.target.value
                          setName(v)
                          if (error === f.errors.nameShort && v.trim().length >= 2) {
                            setError(null)
                          }
                        }}
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
                  <p className="font-mono text-[12px] tabular-nums tracking-wide text-cyan-200/95 sm:text-sm">
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
                </div>

                {!address ? null : (
                  <div className="space-y-2 border-t border-cyan-900/40 pt-2">
                    <p className="text-[11px] text-cyan-100/90 sm:text-[12px]">
                      {f.walletLabel}: <span className="font-medium text-cyan-50">{truncateAddress(address)}</span>
                    </p>
                    <p className="text-[11px] text-cyan-200/88 sm:text-[12px]">
                      {lang === "es" ? "Artista" : "Artist"}:{" "}
                      <span className="font-medium text-cyan-100">{artistAlias ?? (lang === "es" ? "sin alias" : "no alias")}</span>
                    </p>
                    <div className="rounded border border-cyan-900/50 bg-black/40 p-2">
                      <ArtistAliasControl compact />
                    </div>
                    <p className="font-mono text-[12px] tabular-nums text-cyan-200/95 sm:text-sm">
                      <span className="text-cyan-300/90">{pickCopy(lang).chamber.liqBalance}</span>
                      {": "}
                      <span className="text-cyan-50">{stroopsToLiqDisplay(tokenBalance)} </span>
                      <PhaserLiqExpertLink />
                    </p>
                  </div>
                )}
              </div>

              <div className="shrink-0 space-y-1.5 border-t border-cyan-900/50 pt-1.5">
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
                    className="tactical-interactive-glitch w-full border-4 border-double border-[#00ffff]/60 py-2.5 text-[11px] uppercase tracking-widest text-[#00ffff] transition-colors hover:bg-[#00ffff]/10 disabled:opacity-50 sm:text-xs"
                  >
                    {connecting ? f.linking : f.linkWallet}
                  </button>
                ) : (
                  <>
                    {forgeMode === "MANUAL" ? (
                      <button
                        type="button"
                        disabled={isMintingCollection || actionLockedByProtocol}
                        onClick={() => {
                          playTacticalUiClick()
                          void handleManualUploadAndMint().catch(() => {})
                        }}
                        className={cn(
                          "tactical-interactive-glitch w-full border-4 border-double border-[#00ffff] bg-[#00ffff]/5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#00ffff] shadow-[0_0_20px_rgba(0,255,255,0.14)] transition-all hover:bg-[#00ffff]/15 hover:shadow-[0_0_28px_rgba(0,255,255,0.2)] disabled:opacity-40 sm:text-[12px]",
                          isMintingCollection && "forge-forge-glitch",
                          forgeUx.mintManualGlow && "forge-cta-pulse",
                        )}
                      >
                        {isMintingCollection ? statusLine || f.deploying : f.manualUploadMint}
                      </button>
                    ) : agentState === "COMPLETE" ? (
                      <button
                        type="button"
                        disabled={isMintingCollection || actionLockedByProtocol}
                        onClick={() => {
                          playTacticalUiClick()
                          void handleMintArtifact().catch(() => {})
                        }}
                        className={cn(
                          "tactical-interactive-glitch w-full border-4 border-double border-[#00ffff] bg-[#00ffff]/5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#00ffff] shadow-[0_0_20px_rgba(0,255,255,0.14)] transition-all hover:bg-[#00ffff]/15 hover:shadow-[0_0_28px_rgba(0,255,255,0.2)] disabled:opacity-40 sm:text-[12px]",
                          isMintingCollection && "forge-forge-glitch",
                          forgeUx.mintOracleGlow && "forge-cta-pulse",
                        )}
                      >
                        {isMintingCollection ? statusLine || f.deploying : "[ ARTIFACT_READY_FOR_MINT ]"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || actionLockedByProtocol}
                        onClick={() => {
                          playTacticalUiClick()
                          void handleForgeAgent().catch(() => {})
                        }}
                        className={cn(
                          "tactical-interactive-glitch w-full border-4 border-double border-[#00ffff] bg-[#00ffff]/5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#00ffff] shadow-[0_0_20px_rgba(0,255,255,0.14)] transition-all hover:bg-[#00ffff]/15 hover:shadow-[0_0_28px_rgba(0,255,255,0.2)] disabled:opacity-40 sm:text-[12px]",
                          agentState === "PROCESSING_PAYMENT" && "forge-x402-blink",
                          agentState === "FORGING_MATTER" && "forge-forge-glitch",
                          forgeUx.initiateGlow && "forge-cta-pulse",
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
                      className="tactical-interactive-glitch w-full border-2 border-cyan-500/35 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-cyan-400/80 hover:border-red-500/50 hover:text-red-300"
                    >
                      {f.disconnect}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div
              className={cn(
                "flex w-full flex-col lg:col-span-7",
                showCollectionLivePanel ? "min-h-0" : "min-h-[190px]",
              )}
            >
              <div className="flex min-h-0 w-full flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start lg:gap-4">
                <div className="min-h-0 w-full">
                  <p className="mb-2 shrink-0 border-b border-cyan-500/35 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/95">
                    {f.artPreview}
                  </p>
                  <div
                    className={cn(
                      "art-retro-monitor flex flex-col items-center justify-center overflow-hidden px-2 py-2",
                      showCollectionLivePanel
                        ? "min-h-[min(120px,22vh)] lg:min-h-[min(140px,24vh)]"
                        : "min-h-[min(220px,34vh)] lg:min-h-[min(285px,40vh)]",
                    )}
                  >
                    {previewSrc ? (
                      <div className="phase-artifact-preview-clean tactical-holo-wrap relative z-[3] flex h-full max-h-full w-full max-w-full flex-col items-center justify-center gap-2">
                        <IpfsDisplayImg
                          uri={previewSrc}
                          className={cn(
                            "art-retro-monitor__img tactical-holo-img relative z-[3] max-w-full object-contain",
                            showCollectionLivePanel
                              ? "max-h-[min(28vh,240px)]"
                              : "max-h-[min(52vh,420px)]",
                          )}
                          loading="lazy"
                        />
                        {previewLoreText ? (
                          <div className="custom-scrollbar max-h-20 w-full max-w-lg overflow-y-auto border border-cyan-500/25 bg-black/50 px-2 py-1.5 text-left">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-cyan-500/80">{f.lorePreview}</p>
                            <p className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-snug text-cyan-100/90">
                              {previewLoreText}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="relative z-[3] px-2 text-center font-mono text-[10px] font-medium uppercase leading-relaxed tracking-[0.2em] text-cyan-400/85">
                        {forgeMode === "MANUAL" ? f.manualAwaiting : f.awaitingFeed}
                        <br />
                        <span className="text-[9px] tracking-widest text-cyan-500/70">
                          {forgeMode === "MANUAL" ? f.manualAwaitingHint : f.oracleHint}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                {address ? (
                  <aside className="tactical-frame ml-auto w-full border-cyan-500/35 bg-black/35 p-2.5 lg:sticky lg:top-2 lg:self-start">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/90">
                      {pickCopy(lang).chamber.rewardsSectionTitle}
                    </p>
                    <div className="w-full" onWheelCapture={captureWheelOnRewardsPanel}>
                      <LiquidityFaucetControl
                        address={address}
                        tokenBalance={tokenBalance}
                        compact
                        onRefreshBalance={refreshLiqBalance}
                        className="rounded-none border-0 bg-transparent p-0 shadow-none"
                        freighterNftCollect={
                          collectionPhaseTokenId != null ? { tokenId: collectionPhaseTokenId } : null
                        }
                      />
                    </div>
                  </aside>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
