"use client"

import { useEffect } from "react"

/**
 * /faucet — opens the global FaucetModal via CustomEvent.
 * The modal is mounted in AppProviders so it works from any route.
 */
export default function FaucetPage() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("open-faucet"))
  }, [])

  return null
}
