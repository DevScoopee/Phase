/** `true` si el servidor tiene `PINATA_JWT` / `PINATA_API_JWT` (consulta segura vía GET). */
export async function isIpfsUploadConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/ipfs", { method: "GET", cache: "no-store" })
    if (!res.ok) return false
    const data = (await res.json()) as { configured?: boolean }
    return Boolean(data.configured)
  } catch {
    return false
  }
}

/**
 * Sube un `Blob` o `File` vía ruta interna `/api/ipfs` (Pinata en servidor).
 * Devuelve una URI `ipfs://CID` lista para `create_collection`.
 */
export async function uploadToIPFS(fileOrBlob: Blob | File): Promise<string> {
  const fd = new FormData()
  const name = fileOrBlob instanceof File ? fileOrBlob.name : "phase-art.png"
  fd.append("file", fileOrBlob, name)

  const res = await fetch("/api/ipfs", { method: "POST", body: fd })
  let data: { uri?: string; error?: string } = {}
  try {
    data = (await res.json()) as typeof data
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    throw new Error(data.error || `Subida IPFS falló (${res.status})`)
  }
  if (typeof data.uri !== "string" || !data.uri.startsWith("ipfs://")) {
    throw new Error("Respuesta IPFS inválida (falta uri ipfs://).")
  }
  return data.uri
}
