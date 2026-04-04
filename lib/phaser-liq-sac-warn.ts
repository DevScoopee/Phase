import { expectedClassicPhaserLiqSorobanContractId } from "@/lib/classic-liq"

const warnedRoutes = new Set<string>()

/**
 * Si `configuredTokenContractId` no es el SAC del asset clásico (code+issuer), registra un warning
 * una vez por `routeLabel` (p. ej. `faucet`, `forge-agent`) para detectar env mal alineado con Stellar Expert.
 */
export function warnPhaserLiqSacMismatchOnce(configuredTokenContractId: string, routeLabel: string): void {
  const expected = expectedClassicPhaserLiqSorobanContractId()
  if (configuredTokenContractId === expected) return
  if (warnedRoutes.has(routeLabel)) return
  warnedRoutes.add(routeLabel)
  console.warn(
    `[${routeLabel}] PHASERLIQ: el contrato Soroban (TOKEN_*) no coincide con el Contract ID del asset clásico (code+issuer). ` +
      "Mint/settle/x402 pueden fallar (p. ej. host errors). Compara con Stellar Expert (issuer → Assets → Contract ID) o " +
      "`stellar contract asset deploy --asset CODE:ISSUER --network testnet`.",
    { configuredTokenContract: configuredTokenContractId, expectedSACFromClassic: expected },
  )
}
