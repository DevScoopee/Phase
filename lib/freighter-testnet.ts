import { getNetworkDetails } from "@stellar/freighter-api"

/** Misma cadena que `NETWORK_PASSPHRASE` en testnet (evita importar todo `phase-protocol`). */
export const STELLAR_TESTNET_PASSPHRASE = "Test SDF Network ; September 2015"

/**
 * Si Freighter no está en Stellar testnet, devuelve una etiqueta legible (`d.network`).
 * Si no se puede leer la red (`error` de API), devuelve `null` y no se bloquea el flujo.
 */
export async function freighterTestnetMismatchLabel(): Promise<string | null> {
  try {
    const d = await getNetworkDetails()
    if (d.error) return null
    const p = d.networkPassphrase?.trim()
    if (!p) return null
    if (p === STELLAR_TESTNET_PASSPHRASE) return null
    const label = d.network?.trim()
    return label && label.length > 0 ? label : "unknown"
  } catch {
    return null
  }
}
