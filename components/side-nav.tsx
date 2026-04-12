"use client"

import { useState, useEffect, useMemo } from "react"
import { cn } from "@/lib/utils"
import { useLang } from "@/components/lang-context"
import { pickLandingCopy } from "@/lib/landing-copy"

export function SideNav() {
  const { lang } = useLang()
  const navItems = useMemo(() => pickLandingCopy(lang).sideNav, [lang])
  const [activeSection, setActiveSection] = useState("hero")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { threshold: 0.3 },
    )

    navItems.forEach(({ id }) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [navItems])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <nav
      className="pointer-events-none fixed left-0 top-0 z-50 hidden h-screen w-16 flex-col justify-center md:flex md:w-20"
      aria-label={lang === "es" ? "Secciones de la página" : "Page sections"}
    >
      <div className="pointer-events-auto flex flex-col gap-6 px-4">
        {navItems.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollToSection(id)}
            className="group relative flex items-center gap-3"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-all duration-300",
                activeSection === id ? "bg-accent scale-125" : "bg-muted-foreground/40 group-hover:bg-foreground/60",
              )}
            />
            <span
              className={cn(
                "absolute left-6 font-mono text-[10px] uppercase tracking-widest opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:left-8 whitespace-nowrap",
                activeSection === id ? "text-accent" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  )
}
