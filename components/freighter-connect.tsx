"use client"

import type { ReactNode } from "react"
import { useLang } from "@/components/lang-context"
import { useWallet } from "@/components/wallet-provider"

function truncateAddress(addr: string) {
  if (!addr || addr.length < 14) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

type FreighterConnectProps = {
  /** Rendered after wallet control, e.g. language toggle — prefixed with "|". */
  trailing?: ReactNode
}

export function FreighterConnect({ trailing }: FreighterConnectProps) {
  const { lang } = useLang()
  const { address, connecting, hint, connect, disconnect, artistAlias } = useWallet()
  const t =
    lang === "es"
      ? {
          disconnectTitle: "Desconectar wallet",
          walletLabel: "WALLET",
          artistLabel: "ARTISTA",
          connecting: "Conectando...",
          connect: "Conectar Wallet",
        }
      : {
          disconnectTitle: "Disconnect wallet",
          walletLabel: "WALLET",
          artistLabel: "ARTIST",
          connecting: "Connecting...",
          connect: "Connect Wallet",
        }

  return (
    <div className="flex flex-col items-end gap-1 pointer-events-auto">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {address ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={disconnect}
              className="border border-red-900/50 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-red-700/70 hover:text-red-500 hover:border-red-500 transition-colors"
              title={t.disconnectTitle}
            >
              ✕
            </button>
            <div
              className="border border-green-500/40 bg-background/75 backdrop-blur-md px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-green-400 max-w-[min(100vw-3rem,20rem)] truncate shadow-sm"
              title={address}
            >
              {t.walletLabel} · {truncateAddress(address)}
            </div>
            {artistAlias ? (
              <div className="border border-cyan-500/40 bg-cyan-950/30 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-cyan-200 max-w-[min(100vw-3rem,18rem)] truncate">
                {t.artistLabel} · {artistAlias}
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void connect().catch(() => {})}
            disabled={connecting}
            className="border border-border/80 bg-background/75 backdrop-blur-md px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-accent transition-colors disabled:opacity-50 shadow-sm"
          >
            {connecting ? t.connecting : t.connect}
          </button>
        )}
        {trailing != null ? (
          <>
            <span className="text-muted-foreground/45 select-none" aria-hidden>
              |
            </span>
            {trailing}
          </>
        ) : null}
      </div>
      {hint ? (
        <p className="max-w-[min(100vw-2rem,18rem)] text-right font-mono text-[9px] text-muted-foreground leading-snug">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
