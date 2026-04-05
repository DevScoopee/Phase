"use client"

import type React from "react"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import Lenis from "lenis"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

/** Cockpit pages scroll inside `main` / fixed panels, not the document — Lenis fights nested overflow. */
function lenisDisabledForPath(pathname: string | null): boolean {
  if (!pathname) return false
  return pathname === "/forge" || pathname === "/chamber"
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const lenisRef = useRef<Lenis | null>(null)
  const skip = lenisDisabledForPath(pathname)

  useEffect(() => {
    if (skip) return

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      smoothWheel: true,
    })

    lenisRef.current = lenis

    lenis.on("scroll", ScrollTrigger.update)

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000)
    })

    gsap.ticker.lagSmoothing(0)

    return () => {
      lenis.destroy()
      gsap.ticker.remove(lenis.raf)
      lenisRef.current = null
    }
  }, [skip])

  return <>{children}</>
}
