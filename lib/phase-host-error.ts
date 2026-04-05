/**
 * Interpreta diagnósticos del host Soroban `HostError: Error(Contract, #N)` del contrato PHASE
 * (`PhaseError` en contracts/phase-protocol).
 */

export function parsePhaseContractErrorCode(raw: string): number | null {
  const m = raw.match(/Error\s*\(\s*Contract\s*,\s*#(\d+)\s*\)/i)
  if (m) return parseInt(m[1], 10)
  const m2 = raw.match(/\bContract\s*,\s*#(\d+)\b/i)
  return m2 ? parseInt(m2[1], 10) : null
}

/**
 * @param lines longitud ≥ 14; índice 0 vacío; 1..13 = discriminant PhaseError
 */
export function humanizePhaseHostErrorMessage(
  raw: string,
  lines: readonly string[],
  unknownTpl: string,
): string | null {
  const code = parsePhaseContractErrorCode(raw)
  if (code == null) return null
  if (code >= 1 && code < lines.length) {
    const line = lines[code]
    if (line && line.length > 0) return line
  }
  return unknownTpl.replace(/\{code\}/g, String(code))
}
