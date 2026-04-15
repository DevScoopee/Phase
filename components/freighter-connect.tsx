"use client"

import { useState, type ReactNode } from "react"
import { ProfilePanel } from "@/components/profile-panel"
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
  const { address, connecting, hint, connect, disconnect } = useWallet()
  const [panelOpen, setPanelOpen] = useState(false)

  const t =
    lang === "es"
      ? {
          walletLabel: "WALLET",
          connecting: "Conectando...",
          connect: "Conectar Wallet",
        }
      : {
          walletLabel: "WALLET",
          connecting: "Connecting...",
          connect: "Connect Wallet",
        }

  return (
    <div className="flex flex-col items-end gap-1 pointer-events-auto">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {address ? (
          <>
            <ProfilePanel
              open={panelOpen}
              onOpenChange={setPanelOpen}
              address={address}
              disconnect={disconnect}
            />
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="group flex items-center gap-2 rounded-sm border border-violet-700/40 bg-violet-950/30 px-3 py-1.5 hover:border-violet-500/60 transition-colors"
              title={address}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" aria-hidden />
              <span className="max-w-[min(100vw-10rem,14rem)] truncate font-mono text-[10px] font-medium uppercase tracking-widest text-violet-300">
                {t.walletLabel} · {truncateAddress(address)}
              </span>
            </button>
          </>
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
