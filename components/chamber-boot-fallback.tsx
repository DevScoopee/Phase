"use client"

import { useLang } from "@/components/lang-context"
import { pickCopy } from "@/lib/phase-copy"

export function ChamberBootFallback() {
  const { lang } = useLang()
  const ch = pickCopy(lang).chamber
  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {ch.boot}
    </div>
  )
}
