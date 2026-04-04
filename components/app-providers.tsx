"use client"

import type { ReactNode } from "react"
import { useEffect } from "react"
import { Toaster } from "sonner"
import { LangProvider } from "@/components/lang-context"
import { WalletProvider } from "@/components/wallet-provider"

/** Evita que Next/Turbopack muestre overlay por `Promise.reject(undefined)` (p. ej. Freighter en edge cases). */
function SwallowEmptyUnhandledRejections() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (event.reason === undefined || event.reason === null) {
        event.preventDefault()
        if (process.env.NODE_ENV === "development") {
          console.warn("[PHASE] Ignored promise rejection with empty reason (often wallet extension).")
        }
      }
    }
    window.addEventListener("unhandledrejection", onRejection)
    return () => window.removeEventListener("unhandledrejection", onRejection)
  }, [])
  return null
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <WalletProvider>
        <SwallowEmptyUnhandledRejections />
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          richColors
          toastOptions={{
            className: "font-mono text-xs",
            duration: 4500,
          }}
        />
      </WalletProvider>
    </LangProvider>
  )
}
