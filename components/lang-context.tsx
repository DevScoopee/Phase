"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

export type AppLang = "en" | "es"

type LangContextValue = {
  lang: AppLang
  setLang: (l: AppLang) => void
}

const LangContext = createContext<LangContextValue | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<AppLang>("en")
  const value = useMemo(() => ({ lang, setLang }), [lang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) {
    throw new Error("useLang must be used within LangProvider")
  }
  return ctx
}
