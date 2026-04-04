"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { getAddress, isAllowed, requestAccess, WatchWalletChanges } from "@stellar/freighter-api"

type WalletContextValue = {
  address: string | null
  connecting: boolean
  hint: string | null
  artistAlias: string | null
  aliasLoading: boolean
  connect: () => Promise<void>
  disconnect: () => void
  /** Re-read Freighter; returns the active address or null. */
  refresh: () => Promise<string | null>
  refreshArtistAlias: () => Promise<string | null>
  saveArtistAlias: (alias: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [artistAlias, setArtistAlias] = useState<string | null>(null)
  const [aliasLoading, setAliasLoading] = useState(false)

  /**
   * Freighter sigue “permitido” tras desconectar en la app; sin esto, cualquier
   * `refresh()` (p. ej. tras DISCONNECT o al enfocar la ventana) vuelve a rellenar la dirección.
   */
  const userDisconnectedRef = useRef(false)
  const autoFundedWalletsRef = useRef<Set<string>>(new Set())

  const refresh = useCallback((): Promise<string | null> => {
    const run = async (): Promise<string | null> => {
      try {
        if (userDisconnectedRef.current) {
          setAddress(null)
          return null
        }
        const allowed = await isAllowed()
        if (allowed.error || !allowed.isAllowed) {
          setAddress(null)
          return null
        }
        const { address: addr, error } = await getAddress()
        if (error || !addr) {
          setAddress(null)
          return null
        }
        setAddress(addr)
        return addr
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : e === undefined || e === null
              ? "Freighter unavailable"
              : String(e)
        setHint(msg === "undefined" ? "Freighter unavailable" : msg)
        setAddress(null)
        return null
      }
    }
    return run().catch(() => {
      setAddress(null)
      setHint("Freighter unavailable")
      return null
    })
  }, [])

  useEffect(() => {
    void refresh().catch(() => {})
  }, [refresh])

  useEffect(() => {
    const onFocus = () => void refresh().catch(() => {})
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refresh])

  useEffect(() => {
    if (!address || userDisconnectedRef.current) return
    const watcher = new WatchWalletChanges(3000)
    watcher.watch((params) => {
      try {
        if (userDisconnectedRef.current) return
        if (params.error) {
          setAddress(null)
          return
        }
        setAddress(params.address || null)
      } catch {
        setAddress(null)
      }
    })
    return () => watcher.stop()
  }, [address])

  useEffect(() => {
    if (!address || userDisconnectedRef.current) return
    if (autoFundedWalletsRef.current.has(address)) return
    autoFundedWalletsRef.current.add(address)

    const autoClaimGenesis = async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const postReward = async (reward: string) => {
        const res = await fetch("/api/faucet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address, reward }),
        })
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; pending?: boolean; code?: string }
        return { res, data }
      }
      const settleReward = async (reward: string) => {
        for (let i = 0; i < 8; i++) {
          const { res, data } = await postReward(reward)
          if (res.status === 503 || res.status === 412) return
          if (res.status === 202 || data.pending === true) {
            await sleep(2200)
            continue
          }
          if (res.status === 200 && data.ok === true) return
          if (res.status === 409 && data.code === "FAUCET_MINT_IN_PROGRESS") {
            await sleep(2000)
            continue
          }
          return
        }
      }
      try {
        await settleReward("genesis")
        await settleReward("quest_connect_wallet")
      } catch {
        // Silent: faucet may be disabled or already claimed.
      }
    }

    void autoClaimGenesis().catch(() => {})
  }, [address])

  const refreshArtistAlias = useCallback(async (): Promise<string | null> => {
    if (!address) {
      setArtistAlias(null)
      return null
    }
    setAliasLoading(true)
    try {
      const res = await fetch(`/api/artist-profile?walletAddress=${encodeURIComponent(address)}`, {
        cache: "no-store",
      })
      const data = (await res.json().catch(() => ({}))) as { alias?: string | null }
      if (!res.ok) {
        setArtistAlias(null)
        return null
      }
      const alias = typeof data.alias === "string" && data.alias.trim().length > 0 ? data.alias.trim() : null
      setArtistAlias(alias)
      return alias
    } catch {
      setArtistAlias(null)
      return null
    } finally {
      setAliasLoading(false)
    }
  }, [address])

  const saveArtistAlias = useCallback(
    async (alias: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!address) return { ok: false, error: "Wallet not connected." }
      setAliasLoading(true)
      try {
        const res = await fetch("/api/artist-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address, alias }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string; alias?: string }
        if (!res.ok) {
          return { ok: false, error: data.error || `HTTP ${res.status}` }
        }
        const nextAlias = typeof data.alias === "string" ? data.alias : alias
        setArtistAlias(nextAlias)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      } finally {
        setAliasLoading(false)
      }
    },
    [address],
  )

  useEffect(() => {
    if (!address) {
      setArtistAlias(null)
      return
    }
    void refreshArtistAlias().catch(() => {})
  }, [address, refreshArtistAlias])

  const connect = useCallback((): Promise<void> => {
    const run = async (): Promise<void> => {
      userDisconnectedRef.current = false
      setConnecting(true)
      setHint(null)
      try {
        const res = await requestAccess()
        if (res.error) {
          setAddress(null)
          setHint(res.error.message || "Freighter rejected connection")
          return
        }
        if (res.address) {
          if (!userDisconnectedRef.current) {
            setAddress(res.address)
          }
          setHint(null)
        }
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : e === undefined || e === null
              ? "Freighter request failed"
              : String(e)
        setAddress(null)
        setHint(msg === "undefined" ? "Freighter request failed" : msg)
      } finally {
        setConnecting(false)
      }
    }
    return run().catch(() => {
      setConnecting(false)
      setAddress(null)
      setHint("Freighter unavailable")
    })
  }, [])

  const disconnect = useCallback(() => {
    userDisconnectedRef.current = true
    setAddress(null)
    setArtistAlias(null)
    setHint(null)
  }, [])

  const value = useMemo(
    () => ({
      address,
      connecting,
      hint,
      artistAlias,
      aliasLoading,
      connect,
      disconnect,
      refresh,
      refreshArtistAlias,
      saveArtistAlias,
    }),
    [
      address,
      connecting,
      hint,
      artistAlias,
      aliasLoading,
      connect,
      disconnect,
      refresh,
      refreshArtistAlias,
      saveArtistAlias,
    ],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) {
    throw new Error("useWallet must be used within WalletProvider")
  }
  return ctx
}
