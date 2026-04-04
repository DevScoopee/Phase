"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { signTransaction } from "@stellar/freighter-api"
import { useLang } from "@/components/lang-context"
import { TokenIcon } from "@/components/token-icon"
import {
  buildClassicTrustlineTransactionXdr,
  classicLiqAssetConfigFromPublicEnv,
  parseSignedTxXdr,
  readClassicWalletStatus,
} from "@/lib/classic-liq"
import { pickCopy } from "@/lib/phase-copy"
import { HORIZON_URL } from "@/lib/phase-protocol"
import { playTacticalUiClick } from "@/lib/tactical-ui-click"
import { cn } from "@/lib/utils"

type TrustlineUiState = "STANDBY" | "SIGNING" | "SYNCING" | "READY" | "GET_TESTNET_XLM"

type Props = {
  address: string | null | undefined
  onRequestConnect?: () => Promise<string | null> | string | null
  onReady?: () => void | Promise<void>
  className?: string
}

type HorizonBalance = {
  asset_type?: string
  balance?: string
}

async function fetchNativeXlmBalance(address: string): Promise<number> {
  const res = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(address)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
  if (res.status === 404) return 0
  if (!res.ok) throw new Error(`Could not read testnet account (${res.status}).`)

  const data = (await res.json()) as { balances?: HorizonBalance[] }
  const native = (data.balances ?? []).find((b) => b.asset_type === "native")
  const parsed = Number.parseFloat(native?.balance ?? "0")
  return Number.isFinite(parsed) ? parsed : 0
}

export function TrustlineButton({ address, onRequestConnect, onReady, className }: Props) {
  const { lang } = useLang()
  const ff = pickCopy(lang).forge
  const asset = useMemo(() => classicLiqAssetConfigFromPublicEnv(), [])
  const [walletAddress, setWalletAddress] = useState<string | null>(address ?? null)
  const [uiState, setUiState] = useState<TrustlineUiState>("STANDBY")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>("")
  const [xlmBalance, setXlmBalance] = useState<number | null>(null)

  useEffect(() => {
    setWalletAddress(address ?? null)
  }, [address])

  const refreshTrustlineState = useCallback(
    async (addr: string) => {
      if (!asset) return
      const [status, xlm] = await Promise.all([readClassicWalletStatus(addr, asset), fetchNativeXlmBalance(addr)])
      setXlmBalance(xlm)
      if (status.hasTrustline) {
        setUiState("READY")
        setMessage(ff.trustline_msg_initialized)
        await onReady?.()
      } else if (xlm < 2) {
        setUiState("GET_TESTNET_XLM")
        setMessage(ff.trustline_msg_empty_account)
      } else {
        setUiState("STANDBY")
        setMessage("")
      }
    },
    [asset, ff.trustline_msg_empty_account, ff.trustline_msg_initialized, onReady],
  )

  useEffect(() => {
    if (!walletAddress || !asset) return
    void refreshTrustlineState(walletAddress).catch(() => {})
  }, [asset, refreshTrustlineState, walletAddress])

  const buttonLabel =
    uiState === "SIGNING"
      ? ff.trustline_signing
      : uiState === "SYNCING"
        ? ff.trustline_syncing
        : uiState === "READY"
          ? ff.trustline_ready
          : uiState === "GET_TESTNET_XLM"
            ? ff.trustline_get_testnet_xlm
            : ff.trustline_standby

  const handleClick = useCallback(async () => {
    playTacticalUiClick()
    if (!asset) {
      setMessage(ff.trustline_msg_config_missing)
      return
    }

    let addr = walletAddress
    if (!addr && onRequestConnect) {
      const next = await onRequestConnect()
      addr = next ?? null
      setWalletAddress(addr)
    }
    if (!addr) {
      setMessage(ff.trustline_msg_connect_wallet)
      return
    }

    if (uiState === "GET_TESTNET_XLM") {
      if (typeof window !== "undefined") {
        window.open(`https://friendbot.stellar.org/?addr=${encodeURIComponent(addr)}`, "_blank", "noopener,noreferrer")
      }
      return
    }
    if (uiState === "READY" || busy) return

    setBusy(true)
    setMessage("")
    try {
      const xlm = await fetchNativeXlmBalance(addr)
      setXlmBalance(xlm)
      if (xlm < 2) {
        setUiState("GET_TESTNET_XLM")
        setMessage(ff.trustline_msg_empty_account)
        return
      }

      setUiState("SIGNING")
      const txXdr = await buildClassicTrustlineTransactionXdr(addr, asset)
      const signed = await signTransaction(txXdr, {
        networkPassphrase: "Test SDF Network ; September 2015",
        address: addr,
      })
      if (signed.error) throw new Error(signed.error.message || "SIGN_REJECTED")
      const signedXdr = parseSignedTxXdr(signed)
      if (!signedXdr) throw new Error("Missing signed transaction.")

      setUiState("SYNCING")
      const submitRes = await fetch("/api/classic-liq/trustline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr }),
      })
      const payload = (await submitRes.json().catch(() => ({}))) as { error?: string }
      if (!submitRes.ok) throw new Error(payload.error || `HTTP ${submitRes.status}`)

      let ready = false
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 900))
        const status = await readClassicWalletStatus(addr, asset)
        if (status.hasTrustline) {
          ready = true
          break
        }
      }
      if (!ready) {
        setUiState("SYNCING")
        setMessage(ff.trustline_msg_waiting_confirmation)
        return
      }

      setUiState("READY")
      setMessage(ff.trustline_msg_protocol_ready)
      await onReady?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setUiState("STANDBY")
      setMessage(msg)
    } finally {
      setBusy(false)
    }
  }, [
    asset,
    busy,
    ff.trustline_msg_config_missing,
    ff.trustline_msg_connect_wallet,
    ff.trustline_msg_empty_account,
    ff.trustline_msg_protocol_ready,
    ff.trustline_msg_waiting_confirmation,
    onReady,
    onRequestConnect,
    uiState,
    walletAddress,
  ])

  return (
    <section
      className={cn(
        "tactical-frame mt-2 shrink-0 border-cyan-400/35 bg-cyan-950/20 px-2.5 py-2 shadow-[0_0_16px_rgba(34,211,238,0.1)]",
        className,
      )}
    >
      <p className="tactical-phosphor text-[9px] uppercase tracking-[0.2em] text-cyan-300/85">{ff.trustline_section_title}</p>
      <button
        type="button"
        onClick={() => void handleClick().catch(() => {})}
        disabled={busy}
        className={cn(
          "tactical-interactive-glitch mt-1.5 w-full border-2 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors",
          uiState === "READY"
            ? "border-emerald-500/70 bg-emerald-950/25 text-emerald-200"
            : uiState === "GET_TESTNET_XLM"
              ? "border-amber-500/65 bg-amber-950/25 text-amber-200"
              : "border-cyan-500/60 bg-cyan-950/30 text-cyan-100 hover:border-cyan-300 hover:text-white",
          busy && "opacity-75",
        )}
      >
        <span className="inline-flex items-center justify-center gap-1.5">
          <TokenIcon className={cn("h-4 w-4", uiState === "READY" && "text-emerald-300")} />
          {buttonLabel}
        </span>
      </button>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] text-cyan-300/75">
        <span>
          {ff.trustline_gas_label}: {xlmBalance == null ? "—" : xlmBalance.toFixed(2)}
        </span>
        {walletAddress ? (
          <a
            href={`https://friendbot.stellar.org/?addr=${encodeURIComponent(walletAddress)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-cyan-500/50 underline-offset-2 hover:text-cyan-100"
          >
            {ff.trustline_friendbot_link}
          </a>
        ) : null}
      </div>
      {message ? <p className="mt-1 text-[9px] text-cyan-100/80">{message}</p> : null}
    </section>
  )
}
