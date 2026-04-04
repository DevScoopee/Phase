"use client"

import { useLang, type AppLang } from "@/components/lang-context"

const copy: Record<AppLang, string> = {
  en: "v.01 · experimental build",
  es: "v.01 · compilación experimental",
}

export function LandingBuildStamp() {
  const { lang } = useLang()
  return (
    <div
      className="pointer-events-none fixed bottom-[max(0.65rem,env(safe-area-inset-bottom))] right-[max(0.65rem,env(safe-area-inset-right))] z-[35]"
      aria-hidden
    >
      <p className="max-w-[10rem] text-right font-mono text-[7px] uppercase leading-snug tracking-[0.18em] text-muted-foreground/40 md:text-[8px] md:tracking-[0.22em]">
        {copy[lang]}
      </p>
    </div>
  )
}
