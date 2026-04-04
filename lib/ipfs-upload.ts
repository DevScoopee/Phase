/** `true` if the server exposes a configured upload endpoint (checked via GET, no secrets leaked). */
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
 * Uploads a `Blob` or `File` via `POST /api/ipfs`. Returns a content URI for `create_collection`.
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
    throw new Error(data.error || `Subida falló (${res.status})`)
  }
  if (typeof data.uri !== "string" || !data.uri.startsWith("ipfs://")) {
    throw new Error("Respuesta de subida inválida.")
  }
  return data.uri
}
