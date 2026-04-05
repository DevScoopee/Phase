/**
 * Validaciones estrictas de variables de entorno para prevenir errores comunes
 * en la configuración de contratos y cuentas Stellar.
 */

import { StrKey } from "@stellar/stellar-sdk"

export type EnvValidationError = {
  variable: string
  issue: "missing" | "invalid_format" | "wrong_key_type"
  message: string
  hint: string
}

export type EnvValidationResult = {
  valid: boolean
  errors: EnvValidationError[]
}

function isValidContractId(value: string): boolean {
  return StrKey.isValidContract(value)
}

function isValidAccountId(value: string): boolean {
  return StrKey.isValidEd25519PublicKey(value)
}

/**
 * Valida que un ID de contrato sea válido (prefijo C...) y no una cuenta (G...)
 */
function validateContractId(
  value: string | undefined,
  varName: string,
  purpose: string,
): EnvValidationError | null {
  if (!value || value.trim().length === 0) {
    return {
      variable: varName,
      issue: "missing",
      message: `${varName} no está configurado.`,
      hint: `Debes configurar ${varName} con el Contract ID del ${purpose}. Ejemplo: stellar contract deploy...`,
    }
  }

  const trimmed = value.trim()

  // Detectar si es una cuenta G... en lugar de un contrato C...
  if (isValidAccountId(trimmed) && !isValidContractId(trimmed)) {
    return {
      variable: varName,
      issue: "wrong_key_type",
      message: `${varName} es una dirección de cuenta (G...) pero debe ser un Contract ID (C...).`,
      hint: `El valor actual parece ser una wallet Freighter. Necesitas el Contract ID del ${purpose}. Ejecuta: stellar contract deploy ... o stellar contract asset deploy ...`,
    }
  }

  if (!isValidContractId(trimmed)) {
    return {
      variable: varName,
      issue: "invalid_format",
      message: `${varName} no es un Contract ID válido.`,
      hint: `El Contract ID debe comenzar con "C" y tener 56 caracteres. Ejemplo: CDOAXHWC6YJB7U3ELV67HKJY6HEMJFBNRGJK6WZGUAELBWP3WP77RLFD`,
    }
  }

  return null
}

/**
 * Recorre claves de env en el mismo orden que `lib/phase-protocol.ts`.
 * Si ninguna está definida, la app usa defaults — no es error.
 * Si alguna está definida, debe ser un Contract ID válido (C…).
 */
function validateContractEnvChain(
  env: NodeJS.ProcessEnv,
  keys: string[],
  purpose: string,
): EnvValidationError | null {
  for (const key of keys) {
    const raw = env[key as keyof NodeJS.ProcessEnv]
    if (raw == null || String(raw).trim().length === 0) continue
    const err = validateContractId(String(raw).trim(), key, purpose)
    if (err) return err
    return null
  }
  return null
}

/**
 * Valida que una secret key sea válida
 */
function validateSecretKey(
  value: string | undefined,
  varName: string,
  required: boolean = false,
): EnvValidationError | null {
  if (!value || value.trim().length === 0) {
    if (required) {
      return {
        variable: varName,
        issue: "missing",
        message: `${varName} es requerido pero no está configurado.`,
        hint: `Configura ${varName} en tu archivo .env.local`,
      }
    }
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length < 20) {
    return {
      variable: varName,
      issue: "invalid_format",
      message: `${varName} parece estar incompleto o mal formateado.`,
      hint: `La secret key debe tener al menos 20 caracteres y comenzar con "S".`,
    }
  }

  try {
    // Intentar parsear como keypair
    const { Keypair } = require("@stellar/stellar-sdk")
    Keypair.fromSecret(trimmed)
  } catch {
    return {
      variable: varName,
      issue: "invalid_format",
      message: `${varName} no es una secret key válida de Stellar.`,
      hint: `La secret key debe comenzar con "S" y ser válida para ed25519.`,
    }
  }

  return null
}

/**
 * Valida la configuración completa de entorno para PHASE
 */
export function validatePhaseEnv(): EnvValidationResult {
  const errors: EnvValidationError[] = []
  const env = process.env || {}

  // Contratos Soroban: mismas claves y defaults que `phase-protocol.ts` (omitir "missing" si todo vacío).
  const tokenContract = validateContractEnvChain(
    env,
    [
      "NEXT_PUBLIC_PHASER_TOKEN_ID",
      "PHASER_TOKEN_ID",
      "NEXT_PUBLIC_TOKEN_CONTRACT_ID",
      "TOKEN_CONTRACT_ID",
      "MOCK_TOKEN_ID",
    ],
    "token PHASELQ (Soroban)",
  )
  if (tokenContract) errors.push(tokenContract)

  const phaseProtocol = validateContractEnvChain(
    env,
    ["NEXT_PUBLIC_PHASE_PROTOCOL_ID", "PHASE_PROTOCOL_ID"],
    "protocolo PHASE (NFT)",
  )
  if (phaseProtocol) errors.push(phaseProtocol)

  // Validar secret keys del faucet si están configuradas
  const adminSecret = validateSecretKey(env.ADMIN_SECRET_KEY, "ADMIN_SECRET_KEY")
  if (adminSecret) errors.push(adminSecret)

  const distributorSecret = validateSecretKey(env.FAUCET_DISTRIBUTOR_SECRET_KEY, "FAUCET_DISTRIBUTOR_SECRET_KEY")
  if (distributorSecret) errors.push(distributorSecret)

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Verifica si ADMIN_SECRET_KEY corresponde al issuer del asset clásico
 * Devuelve null si todo está bien, o un mensaje de error si hay problema
 */
export function validateFaucetIssuerConfig(
  adminSecret: string | undefined,
  expectedIssuer: string,
): string | null {
  if (!adminSecret || adminSecret.trim().length < 20) {
    return null // No hay admin configurado, no es error (puede usar distributor)
  }

  try {
    const { Keypair } = require("@stellar/stellar-sdk")
    const kp = Keypair.fromSecret(adminSecret.trim())
    const signerPublic = kp.publicKey()

    if (signerPublic !== expectedIssuer) {
      return `ADMIN_SECRET_KEY (${signerPublic.slice(0, 8)}...) no coincide con el issuer esperado (${expectedIssuer.slice(0, 8)}...). ` +
        `Para el modo mint del faucet, ADMIN_SECRET_KEY debe ser el secret del issuer del asset PHASELQ. ` +
        `Alternativa: usa FAUCET_DISTRIBUTOR_SECRET_KEY para modo transfer.`
    }
  } catch {
    return "ADMIN_SECRET_KEY no es una secret key válida de Stellar."
  }

  return null
}

/**
 * Formatea errores de validación para mostrar en consola
 */
export function formatEnvValidationErrors(result: EnvValidationResult): string {
  if (result.valid) return "✓ Configuración de entorno válida"

  const lines = ["✗ Errores en la configuración de entorno:"]
  for (const err of result.errors) {
    lines.push(`\n[${err.variable}] ${err.issue.toUpperCase()}`)
    lines.push(`  Error: ${err.message}`)
    lines.push(`  Hint: ${err.hint}`)
  }
  return lines.join("\n")
}
