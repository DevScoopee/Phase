/** Firma corta derivada del visor (wallet u otro id) — cambia por sesión/dirección; no es criptografía fuerte. */
export function viewerSignatureShort(address: string | null | undefined): string {
  const s = (address ?? "ANON_VIEWER").trim()
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 6)
}
