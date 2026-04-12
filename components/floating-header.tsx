"use client"

import { useEffect, useState } from "react"
import { FreighterConnect } from "@/components/freighter-connect"
import { LangToggle } from "@/components/lang-toggle"

// Height of the SystemTicker in px (~2.25rem)
const TICKER_PX = 36

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
      <FreighterConnect trailing={<LangToggle />} />
    </div>
  )
}
