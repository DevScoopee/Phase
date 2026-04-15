"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FreighterConnect } from "@/components/freighter-connect"
import { LangToggle } from "@/components/lang-toggle"
import { useWallet } from "@/components/wallet-provider"
import { useLang } from "@/components/lang-context"

// Height of the SystemTicker in px (~2.25rem)
const TICKER_PX = 36

function RewardsButton() {
  const { address } = useWallet()
  const { lang } = useLang()
  if (!address) return null
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("open-faucet"))}
      className="font-mono text-[10px] uppercase tracking-widest border border-violet-700/40 bg-violet-950/30 px-3 py-1.5 text-violet-300 hover:border-violet-500/60 hover:text-violet-100 transition-colors"
    >
      {lang === "es" ? "[ RECOMPENSAS ]" : "[ REWARDS ]"}
    </button>
  )
}

function NavLinks() {
  const { lang } = useLang()
  const pathname = usePathname()
  const links = [
    { href: "/signals", labelEn: "SIGNALS", labelEs: "SEÑALES" },
  ]
  return (
    <>
      {links.map(({ href, labelEn, labelEs }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border transition-colors ${
              active
                ? "border-violet-500/60 bg-violet-950/40 text-violet-200"
                : "border-violet-700/30 bg-transparent text-violet-400/70 hover:border-violet-500/50 hover:text-violet-200"
            }`}
          >
            [ {lang === "es" ? labelEs : labelEn} ]
          </Link>
        )
      })}
    </>
  )
}

export function FloatingHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const check = () => setScrolled(window.scrollY > TICKER_PX)
    check()
    window.addEventListener("scroll", check, { passive: true })
    return () => window.removeEventListener("scroll", check)
  }, [])

  return (
    <div
      style={{
        position: "fixed",
        right: "1.25rem",
        top: scrolled ? "1rem" : "3.5rem",
        zIndex: 50,
        transition: "top 0.25s ease",
        maxWidth: "calc(100vw - 1.5rem)",
      }}
    >
      <FreighterConnect trailing={<><NavLinks /><RewardsButton /><LangToggle /></>} />
    </div>
  )
}
