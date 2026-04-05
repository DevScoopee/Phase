import { expectedClassicPhaserLiqSorobanContractId } from "@/lib/classic-liq"
import { StrKey } from "@stellar/stellar-sdk"

const warnedRoutes = new Set<string>()
const validatedRoutes = new Set<string>()

/**
 * Valida estrictamente que el TOKEN_ADDRESS sea un Contract ID válido (C...)
 * y no una cuenta G... (error común de configuración)
 */
function validateTokenContractId(configuredTokenContractId: string, routeLabel: string): string | null {
  // Verificar si es una cuenta G... (error común)
  if (StrKey.isValidEd25519PublicKey(configuredTokenContractId)) {
    return `[${routeLabel}] ERROR CRÍTICO: TOKEN_ADDRESS es una dirección de cuenta (${configuredTokenContractId.slice(0, 8)}...) pero debe ser un Contract ID (C...). ` +
      `Este es un error común de configuración. Asegúrate de usar el Contract ID del token, no tu dirección de wallet. ` +
      `Solución: Configura NEXT_PUBLIC_PHASER_TOKEN_ID con el Contract ID del SAC, no con tu dirección G...`
  }

  // Verificar formato de contract ID
  if (!StrKey.isValidContract(configuredTokenContractId)) {
    return `[${routeLabel}] ERROR: TOKEN_ADDRESS no es un Contract ID válido. ` +
      `Debe comenzar con "C" y tener 56 caracteres. Valor actual: ${configuredTokenContractId.slice(0, 16)}...`
  }

  return null
}

/**
 * Si `configuredTokenContractId` no es el SAC del asset clásico (code+issuer), registra un warning
 * una vez por `routeLabel` (p. ej. `faucet`, `forge-agent`) para detectar env mal alineado con Stellar Expert.
 *
 * Ahora incluye validaciones estrictas para detectar:
 * - Configuración de G... en lugar de C...
 * - Mismatch entre token configurado y asset clásico
 */
export function warnPhaserLiqSacMismatchOnce(configuredTokenContractId: string, routeLabel: string): void {
  // Validación estricta: solo ejecutar una vez por ruta
  if (validatedRoutes.has(routeLabel)) return
  validatedRoutes.add(routeLabel)

  // Verificar que sea un Contract ID válido (no G...)
  const validationError = validateTokenContractId(configuredTokenContractId, routeLabel)
  if (validationError) {
    console.error(validationError)
    return
  }

  const expected = expectedClassicPhaserLiqSorobanContractId()

  // Solo warn si son diferentes (puede ser intencional en ciertos setups)
  if (configuredTokenContractId === expected) {
    console.log(`[${routeLabel}] PHASELQ: Token contract verificado correctamente (${configuredTokenContractId.slice(0, 8)}...)`)
    return
  }

  if (warnedRoutes.has(routeLabel)) return
  warnedRoutes.add(routeLabel)

  console.warn(
    `[${routeLabel}] PHASELQ WARNING: El contrato Soroban configurado no coincide con el SAC derivado del asset clásico.\n\n` +
    `Configurado: ${configuredTokenContractId}\n` +
    `Esperado (del asset clásico): ${expected}\n\n` +
    `Esto puede causar fallos en mint/settle/x402. Posibles causas:\n` +
    `1. El TOKEN_ADDRESS apunta a un contrato diferente al SAC del asset\n` +
    `2. El asset clásico no tiene su SAC desplegado todavía\n` +
    `3. Las variables NEXT_PUBLIC_CLASSIC_LIQ_* no coinciden con el TOKEN_ADDRESS\n\n` +
    `Para solucionarlo:\n` +
    `1. Verifica el SAC correcto en Stellar Expert: busca el issuer → Assets → Contract ID\n` +
    `2. O ejecuta: stellar contract asset deploy --asset PHASELQ:GISSUER --network testnet`,
    { configured: configuredTokenContractId, expectedFromClassic: expected }
  )
}

/**
 * Obtiene información de diagnóstico sobre el estado del token
 */
export function getPhaserLiqDiagnostic(configuredTokenContractId: string): {
  isValid: boolean
  isContract: boolean
  isAccount: boolean
  matchesClassic: boolean
  errors: string[]
} {
  const errors: string[] = []
  const isAccount = StrKey.isValidEd25519PublicKey(configuredTokenContractId)
  const isContract = StrKey.isValidContract(configuredTokenContractId)
  const isValid = isContract && !isAccount

  if (isAccount) {
    errors.push("TOKEN_ADDRESS es una cuenta G... pero debe ser un Contract C...")
  }
  if (!isValid && !isAccount) {
    errors.push("TOKEN_ADDRESS no tiene un formato válido")
  }

  try {
    const expected = expectedClassicPhaserLiqSorobanContractId()
    const matchesClassic = configuredTokenContractId === expected
    if (!matchesClassic && isValid) {
      errors.push("El token configurado no coincide con el SAC derivado del asset clásico")
    }
    return { isValid, isContract, isAccount, matchesClassic, errors }
  } catch {
    return { isValid, isContract, isAccount, matchesClassic: false, errors }
  }
}
