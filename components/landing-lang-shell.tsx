import type { ReactNode } from "react"

/** @deprecated Root `AppProviders` already wraps `LangProvider`; this is a pass-through. */
export function LandingLangShell({ children }: { children: ReactNode }) {
  return <>{children}</>
}
