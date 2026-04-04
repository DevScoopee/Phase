"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { signTransaction } from "@stellar/freighter-api"
import { toast } from "sonner"
import { useLang } from "@/components/lang-context"
import { TokenIcon } from "@/components/token-icon"
import {
  buildClassicTrustlineTransactionXdr,
  parseSignedTxXdr,
} from "@/lib/classic-liq"
import { pickCopy } from "@/lib/phase-copy"
import { formatLiq, NETWORK_PASSPHRASE } from "@/lib/phase-protocol"
import { playTacticalUiClick } from "@/lib/tactical-ui-click"
import { cn } from "@/lib/utils"

type RewardType = "genesis" | "daily" | "quest_connect_wallet" | "quest_first_collection" | "quest_first_settle"

type RewardState = {
  claimable: boolean
  claimedAt: number | null
  nextAt: number | null
  amountStroops: string
  requirementMet?: boolean
  progressPct?: number
  requirementText?: string
}

type FaucetStatusResponse = {
  enabled: boolean
  questOverview?: {
    completed: number
    total: number
    progressPct: number
  }
  rewards?: Partial<Record<RewardType, RewardState>>
}

type ClassicLiqApiWallet = {
  enabled: boolean
  asset?: { code: string; issuer: string }
  status?: { accountExists?: boolean; hasTrustline?: boolean }
}

type RewardFlowPhase = "idle" | "trustline" | "transmit"

type Props = {
  address: string | null | undefined
  tokenBalance: string
  className?: string
  onNarrativeLog?: (line: string) => void
  onRefreshBalance: () => void | Promise<void>
}

export function LiquidityFaucetControl({
  address,
  tokenBalance: _tokenBalance,
  className,
  onNarrativeLog,
  onRefreshBalance,
}: Props) {
  const { lang } = useLang()
  const ch = pickCopy(lang).chamber
  const logs = ch.logs

  const [status, setStatus] = useState<FaucetStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingReward, setLoadingReward] = useState<RewardType | null>(null)
  const [rewardFlowPhase, setRewardFlowPhase] = useState<RewardFlowPhase>("idle")
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    if (!helpOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelpOpen(false)
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [helpOpen])

  const loadStatus = useCallback(async () => {
    const query = address ? `?walletAddress=${encodeURIComponent(address)}` : ""
    const res = await fetch(`/api/faucet${query}`, { cache: "no-store" })
    const data = (await res.json().catch(() => ({}))) as FaucetStatusResponse
    if (!res.ok) throw new Error("Unable to load faucet status")
    setStatus(data)
  }, [address])

  useEffect(() => {
    void loadStatus().catch(() => setStatus({ enabled: false }))
  }, [loadStatus])

  const ensureClassicTrustlineForReward = useCallback(async (): Promise<boolean> => {
    if (!address) return true
    const chamber = pickCopy(lang).chamber
    const L = chamber.logs
    let classic: ClassicLiqApiWallet
    try {
      const cr = await fetch(
        `/api/classic-liq?walletAddress=${encodeURIComponent(address)}`,
        { cache: "no-store" },
      )
      classic = (await cr.json().catch(() => ({}))) as ClassicLiqApiWallet
    } catch {
      return true
    }
    if (!classic.enabled || !classic.asset) return true
    const hasTrustline = Boolean(classic.status?.hasTrustline)
    if (hasTrustline) return true
    if (!classic.status?.accountExists) {
      onNarrativeLog?.(L.classicTrustlineAccountMissing)
      toast.error(chamber.rewardsTrustlineAccountMissing)
      return false
    }
    onNarrativeLog?.(L.classicTrustlineEstablishing)
    onNarrativeLog?.(L.classicTrustlineFreighter)
    setRewardFlowPhase("trustline")
    try {
      const trustTx = await buildClassicTrustlineTransactionXdr(address, classic.asset)
      const signResult = await signTransaction(trustTx, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      })
      if (signResult.error) {
        onNarrativeLog?.(L.classicTrustlineRejected)
        toast.error(chamber.rewardsTrustlineRejectedToast)
        return false
      }
      const signedXdr = parseSignedTxXdr(signResult)
      if (!signedXdr) {
        onNarrativeLog?.(L.classicTrustlineRejected)
        toast.error(chamber.rewardsTrustlineRejectedToast)
        return false
      }
      const submitRes = await fetch("/api/classic-liq/trustline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr }),
      })
      const submitData = (await submitRes.json().catch(() => ({}))) as { error?: string }
      if (!submitRes.ok) {
        const msg = submitData.error || `HTTP ${submitRes.status}`
        onNarrativeLog?.(`${L.faucetFailPrefix} ${msg}`)
        toast.error(msg)
        return false
      }
      onNarrativeLog?.(L.classicTrustlineConfirmed)
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onNarrativeLog?.(`${L.faucetFailPrefix} ${msg}`)
      toast.error(msg)
      return false
    } finally {
      setRewardFlowPhase("idle")
    }
  }, [address, lang, onNarrativeLog])

  const request = useCallback(
    async (reward: RewardType) => {
      if (!address || loading || loadingReward) return
      playTacticalUiClick()
      setLoading(true)
      setLoadingReward(reward)
      setRewardFlowPhase("idle")
      onNarrativeLog?.(
        lang === "es"
          ? `[ SOLICITANDO_RECOMPENSA :: ${reward.toUpperCase()} ]`
          : `[ REQUESTING_REWARD :: ${reward.toUpperCase()} ]`,
      )
      try {
        const trustOk = await ensureClassicTrustlineForReward()
        if (!trustOk) {
          await loadStatus()
          return
        }

        setRewardFlowPhase("transmit")
        const res = await fetch("/api/faucet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address, reward }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          ok?: boolean
          pending?: boolean
          note?: string
          hash?: string
          amountStroops?: string
        }
        if (!res.ok) {
          const msg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`
          onNarrativeLog?.(`${logs.faucetFailPrefix} ${msg}`)
          toast.error(msg)
          await loadStatus()
          return
        }
        if (data.pending || data.ok === false) {
          const msg =
            typeof data.note === "string"
              ? data.note
              : lang === "es"
                ? "Transacción pendiente en ledger. Reintenta en unos segundos."
                : "Transaction pending on ledger. Retry in a few seconds."
          onNarrativeLog?.(`${logs.tracePrefix} ${msg}`)
          toast.message(msg)
          await loadStatus()
          return
        }
        const amount = formatLiq(data.amountStroops ?? "0")
        const line =
          lang === "es"
            ? `[ RECOMPENSA_ACREDITADA ] +${amount} PHASERLIQ`
            : `[ REWARD_CREDITED ] +${amount} PHASERLIQ`
        onNarrativeLog?.(logs.faucetOk)
        onNarrativeLog?.(line)
        if (data.hash) onNarrativeLog?.(`${logs.tracePrefix} ${data.hash}`)
        toast.success(line, {
          icon: <TokenIcon className="h-4 w-4" pulse />,
        })
        await onRefreshBalance()
        await loadStatus()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        onNarrativeLog?.(`${logs.faucetFailPrefix} ${msg}`)
        toast.error(msg)
      } finally {
        setLoading(false)
        setLoadingReward(null)
        setRewardFlowPhase("idle")
      }
    },
    [address, ensureClassicTrustlineForReward, lang, loadStatus, loading, loadingReward, logs, onNarrativeLog, onRefreshBalance],
  )

  const statusLabel = useCallback(
    (reward: RewardState | undefined) => {
      if (!reward) return lang === "es" ? "CARGANDO..." : "LOADING..."
      if (reward.requirementMet === false) return lang === "es" ? "BLOQUEADO" : "LOCKED"
      if (reward.claimable) return lang === "es" ? "LISTO" : "READY"
      if (reward.nextAt) {
        const t = new Date(reward.nextAt).toLocaleString(lang === "es" ? "es-ES" : "en-US")
        return `RESET @ ${t}`
      }
      return lang === "es" ? "RECLAMADO" : "CLAIMED"
    },
    [lang],
  )

  const rewardButton = (
    reward: RewardType,
    title: string,
    description: string,
    state: RewardState | undefined,
  ) => {
    const disabled = loading || loadingReward !== null || !state?.claimable
    const isActive = loadingReward === reward
    const trustlineUi = isActive && rewardFlowPhase === "trustline"
    const transmitUi = isActive && rewardFlowPhase === "transmit"
    const pct = Math.max(0, Math.min(100, state?.claimedAt ? 100 : state?.progressPct ?? 0))
    return (
      <div className="tactical-interactive-glitch rounded border border-cyan-400/30 bg-cyan-950/10 p-2.5 shadow-[inset_0_1px_0_rgba(34,211,238,0.06)]">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.18em] text-cyan-100/95 sm:text-xs">
            {title}
          </span>
          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums tracking-tight text-cyan-200/95">
            {state ? `+${formatLiq(state.amountStroops)}` : "—"}
            {state ? <span className="ml-1 text-[11px] font-medium text-cyan-400/80">LIQ</span> : null}
          </span>
        </div>
        <p className="mb-2 text-[11px] leading-snug text-cyan-100/60">{description}</p>
        <div className="mb-2">
          <div className="h-2 w-full overflow-hidden rounded bg-cyan-950/70">
            <div
              className="h-full bg-cyan-300/75 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-cyan-300/70">
            {lang === "es" ? "PROGRESO" : "PROGRESS"}{" "}
            <span className="tabular-nums">{pct}</span>%
          </p>
          {state?.requirementText && !state.claimedAt ? (
            <p className="mt-1 text-[10px] leading-snug text-gray-400">{state.requirementText}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/75">{statusLabel(state)}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void request(reward).catch(() => {})}
            className={cn(
              "tactical-phosphor text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors",
              trustlineUi && "tactical-reward-trustline-establishing border-amber-600/70 text-amber-100",
              Boolean(state?.claimedAt) &&
                "cursor-not-allowed border border-gray-800 px-3 py-1 text-gray-600 opacity-50",
              !state?.claimedAt &&
                state?.claimable &&
                loadingReward === null &&
                !loading &&
                "cursor-pointer border border-cyan-800 bg-transparent px-3 py-1 text-cyan-100 hover:border-cyan-500 hover:bg-cyan-900/30",
              !state?.claimedAt &&
                (!state?.claimable || loading || loadingReward !== null) &&
                "cursor-not-allowed border border-cyan-950/50 bg-transparent px-3 py-1 text-cyan-600/50 opacity-60",
            )}
          >
            {loadingReward === reward
              ? trustlineUi
                ? ch.rewardsButtonEstablishingTrustline
                : transmitUi
                  ? ch.rewardsButtonTransmittingFunds
                  : lang === "es"
                    ? "PROCESANDO..."
                    : "PROCESSING..."
              : state?.claimedAt
                ? lang === "es"
                  ? "RECLAMADO"
                  : "CLAIMED"
                : lang === "es"
                  ? "RECLAMAR"
                  : "CLAIM"}
          </button>
        </div>
      </div>
    )
  }

  if (!address || status?.enabled === false) return null

  const helpModal =
    helpOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="liq-rewards-help-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
              aria-label={ch.rewardsHelpClose}
              onClick={() => setHelpOpen(false)}
            />
            <div className="relative max-h-[min(85vh,32rem)] w-full max-w-md overflow-y-auto rounded-lg border border-cyan-500/45 bg-[oklch(0.078_0.022_218)] p-4 shadow-[0_0_48px_rgba(34,211,238,0.12)] sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-3 border-b border-cyan-500/20 pb-3">
                <h2
                  id="liq-rewards-help-title"
                  className="tactical-phosphor text-left text-sm font-bold uppercase tracking-[0.2em] text-cyan-100"
                >
                  {ch.rewardsHelpModalTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  className="tactical-phosphor shrink-0 rounded border border-cyan-500/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-cyan-200 hover:border-cyan-300 hover:text-white"
                >
                  {ch.rewardsHelpClose}
                </button>
              </div>
              <div className="space-y-4 text-[13px] leading-relaxed text-cyan-100/88">
                <div>
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{ch.rewardsHelpLiqTitle}</h3>
                  <p className="whitespace-pre-line text-cyan-100/82">{ch.rewardsHelpLiqBody}</p>
                </div>
                <div>
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{ch.rewardsHelpQuestsTitle}</h3>
                  <p className="whitespace-pre-line text-cyan-100/82">{ch.rewardsHelpQuestsBody}</p>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <section
      className={cn(
        "tactical-quest-flow w-full rounded border border-cyan-400/35 bg-slate-950/40 p-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.05)] backdrop-blur-[2px] sm:p-3.5",
        className,
      )}
    >
      {helpModal}
      <header className="mb-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="tactical-phosphor min-w-0 flex-1 text-[11px] uppercase tracking-[0.22em] text-cyan-100 sm:text-xs">
            {ch.rewardsSectionTitle}
          </p>
          <button
            type="button"
            onClick={() => {
              playTacticalUiClick()
              setHelpOpen(true)
            }}
            aria-label={ch.rewardsHelpAria}
            title={ch.rewardsHelpAria}
            className="tactical-interactive-glitch tactical-phosphor flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-950/40 text-sm font-bold text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-900/50 hover:text-white"
          >
            ?
          </button>
        </div>
        <div className="mt-2">
          <div className="h-2 w-full overflow-hidden rounded bg-cyan-950/70">
            <div
              className="h-full bg-cyan-300/80 transition-all"
              style={{ width: `${status?.questOverview?.progressPct ?? 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-cyan-300/75">
            {ch.rewardsQuestProgress}{" "}
            <span className="tabular-nums">
              {status?.questOverview
                ? `${status.questOverview.completed}/${status.questOverview.total}`
                : "—/—"}
            </span>
          </p>
        </div>
      </header>
      <div className="tactical-quest-flow__lane">
        <p className="tactical-quest-flow__lane-title">{ch.rewardsLiquidityLaneTitle}</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {rewardButton(
            "genesis",
            "GENESIS SUPPLY",
            lang === "es" ? "Carga inicial para wallets nuevas." : "Initial bootstrap supply for new wallets.",
            status?.rewards?.genesis,
          )}
          {rewardButton(
            "daily",
            "DAILY RECHARGE",
            lang === "es" ? "Recarga diaria para pruebas en testnet." : "Daily recharge for testnet experimentation.",
            status?.rewards?.daily,
          )}
        </div>
      </div>
      <div className="tactical-quest-flow__missions">
        <div className="tactical-quest-flow__rail" aria-hidden />
        <p className="tactical-quest-flow__chain-title pl-5">{ch.rewardsMissionChainTitle}</p>
        <div className="pl-1">
          <div className="tactical-quest-step">
            {rewardButton(
              "quest_connect_wallet",
              "QUEST_01 · CONNECT",
              lang === "es" ? "Primera conexión de wallet." : "First wallet connection reward.",
              status?.rewards?.quest_connect_wallet,
            )}
          </div>
          <div className="tactical-quest-step">
            {rewardButton(
              "quest_first_collection",
              "QUEST_02 · COLLECTION",
              lang === "es" ? "Crear tu primera colección." : "Create your first collection.",
              status?.rewards?.quest_first_collection,
            )}
          </div>
          <div className="tactical-quest-step">
            {rewardButton(
              "quest_first_settle",
              "QUEST_03 · SETTLEMENT",
              lang === "es" ? "Completar tu primer settlement." : "Complete your first settlement.",
              status?.rewards?.quest_first_settle,
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
