"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useLang } from "@/components/lang-context"
import { TokenIcon } from "@/components/token-icon"
import { pickCopy } from "@/lib/phase-copy"
import { formatLiq } from "@/lib/phase-protocol"
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
  const logs = pickCopy(lang).chamber.logs

  const [status, setStatus] = useState<FaucetStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingReward, setLoadingReward] = useState<RewardType | null>(null)

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

  const request = useCallback(
    async (reward: RewardType) => {
      if (!address || loading || loadingReward) return
      setLoading(true)
      setLoadingReward(reward)
      onNarrativeLog?.(
        lang === "es"
          ? `[ SOLICITANDO_RECOMPENSA :: ${reward.toUpperCase()} ]`
          : `[ REQUESTING_REWARD :: ${reward.toUpperCase()} ]`,
      )
      try {
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
            ? `[ RECOMPENSA_ACREDITADA ] +${amount} PHASER_LIQ`
            : `[ REWARD_CREDITED ] +${amount} PHASER_LIQ`
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
      }
    },
    [address, lang, loadStatus, loading, loadingReward, logs, onNarrativeLog, onRefreshBalance],
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
    const pct = Math.max(0, Math.min(100, state?.claimedAt ? 100 : state?.progressPct ?? 0))
    return (
      <div className="rounded border border-cyan-400/30 bg-cyan-950/10 p-2" key={reward}>
        <div className="mb-1 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.24em] text-cyan-100/90">
          <span>{title}</span>
          <span className="text-cyan-300/80">{state ? `+${formatLiq(state.amountStroops)} LIQ` : "--"}</span>
        </div>
        <p className="mb-2 text-[10px] text-cyan-200/65">{description}</p>
        <div className="mb-2">
          <div className="h-1.5 w-full overflow-hidden rounded bg-cyan-950/70">
            <div
              className="h-full bg-cyan-300/75 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-[9px] uppercase tracking-[0.2em] text-cyan-300/60">
            {lang === "es" ? "PROGRESO" : "PROGRESS"} {pct}%
          </p>
          {state?.requirementText && !state.claimedAt ? (
            <p className="mt-1 text-[9px] text-cyan-300/65">{state.requirementText}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] uppercase tracking-[0.22em] text-cyan-300/70">{statusLabel(state)}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void request(reward).catch(() => {})}
            className="tactical-phosphor border border-cyan-400/40 bg-cyan-950/45 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-100 transition hover:border-cyan-300 hover:text-cyan-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loadingReward === reward
              ? lang === "es"
                ? "PROCESANDO..."
                : "PROCESSING..."
              : "CLAIM"}
          </button>
        </div>
      </div>
    )
  }

  if (!address || status?.enabled === false) return null

  return (
    <section className={cn("w-full rounded border border-cyan-400/35 bg-slate-950/50 p-3", className)}>
      <header className="mb-3">
        <p className="tactical-phosphor text-[10px] uppercase tracking-[0.26em] text-cyan-100">
          {lang === "es" ? "[ FORMAS_DE_CONSEGUIR_PHASER_LIQ ]" : "[ WAYS_TO_EARN_PHASER_LIQ ]"}
        </p>
        <p className="mt-1 text-[10px] text-cyan-200/65">
          {lang === "es"
            ? "Genesis (una vez), Daily (cada 24h), Quests (una vez por misión)."
            : "Genesis (one-time), Daily (every 24h), Quests (one-time per mission)."}
        </p>
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded bg-cyan-950/70">
            <div
              className="h-full bg-cyan-300/80 transition-all"
              style={{ width: `${status?.questOverview?.progressPct ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-[9px] uppercase tracking-[0.2em] text-cyan-300/70">
            {lang === "es" ? "PROGRESO QUESTS" : "QUEST PROGRESS"}{" "}
            {status?.questOverview
              ? `${status.questOverview.completed}/${status.questOverview.total}`
              : "--/--"}
          </p>
        </div>
      </header>
      <div className="grid gap-2">
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
        {rewardButton(
          "quest_connect_wallet",
          "QUEST #1 · CONNECT",
          lang === "es" ? "Primera conexión de wallet." : "First wallet connection reward.",
          status?.rewards?.quest_connect_wallet,
        )}
        {rewardButton(
          "quest_first_collection",
          "QUEST #2 · COLLECTION",
          lang === "es" ? "Crear tu primera colección." : "Create your first collection.",
          status?.rewards?.quest_first_collection,
        )}
        {rewardButton(
          "quest_first_settle",
          "QUEST #3 · SETTLEMENT",
          lang === "es" ? "Completar tu primer settlement." : "Complete your first settlement.",
          status?.rewards?.quest_first_settle,
        )}
      </div>
    </section>
  )
}
