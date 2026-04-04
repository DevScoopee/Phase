"use client"

import type { ReactNode } from "react"
import { Toaster } from "sonner"
import { LangProvider } from "@/components/lang-context"
import { WalletProvider } from "@/components/wallet-provider"

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <WalletProvider>
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
