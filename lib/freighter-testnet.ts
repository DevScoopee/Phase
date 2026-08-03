"use client"

import { initStellarWalletKit, kit } from "@/lib/stellar-wallet-kit"

/** Misma cadena que `NETWORK_PASSPHRASE` en testnet (evita importar todo `phase-protocol`). */
export const STELLAR_TESTNET_PASSPHRASE = "Test SDF Network ; September 2015"

/**
 * Si la wallet conectada vía Stellar Wallets Kit no está en Stellar testnet, devuelve una etiqueta legible (`d.network`).
 * Si no hay sesión de firma o no se puede leer la red, devuelve `null` y no se bloquea el flujo.
 */
export async function freighterTestnetMismatchLabel(): Promise<string | null> {
  try {
    initStellarWalletKit()
    const d = await kit.getNetwork()
    const p = d.networkPassphrase?.trim()
    if (!p) return null
    if (p === STELLAR_TESTNET_PASSPHRASE) return null
    const label = d.network?.trim()
    return label && label.length > 0 ? label : "unknown"
  } catch {
    return null
  }
}
