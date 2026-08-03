"use client"

import { useLang } from "@/components/lang-context"
import { cn } from "@/lib/utils"

type LangToggleProps = {
  /** High-contrast cyan style for forge / dashboard / tactical UI. */
  variant?: "default" | "phosphor"
  className?: string
}

/** Compact EN | ES control (landing: default; tactical surfaces: phosphor). */
export function LangToggle({ variant = "default", className }: LangToggleProps) {
  const { lang, setLang } = useLang()

  const isPhosphor = variant === "phosphor"
  const baseWrap = isPhosphor
    ? "border border-violet-500/45 bg-black/55 shadow-[0_0_10px_rgba(139,92,246,0.1)] backdrop-blur-sm"
    : "border border-border/60 bg-background/75 shadow-sm backdrop-blur-md text-muted-foreground"

  const active   = isPhosphor ? "bg-violet-500/20 text-violet-100"                          : "bg-foreground/10 text-foreground"
  const inactive = isPhosphor ? "text-violet-300/80 hover:bg-violet-500/15 hover:text-violet-100" : "hover:text-foreground"
  const divider  = isPhosphor ? "border-violet-500/35"                                       : "border-border/60"

  return (
    <div
      className={cn(
        "inline-flex items-stretch font-mono text-[10px] font-semibold uppercase tracking-widest",
        baseWrap,
        className,
      )}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        className={cn("px-2.5 py-2 transition-colors", lang === "en" ? active : inactive)}
        aria-pressed={lang === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("es")}
        className={cn("border-l px-2.5 py-2 transition-colors", divider, lang === "es" ? active : inactive)}
        aria-pressed={lang === "es"}
      >
        ES
      </button>
    </div>
  )
}
