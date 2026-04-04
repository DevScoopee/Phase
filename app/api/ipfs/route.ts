import { NextRequest, NextResponse } from "next/server"

function pinataJwt(): string | undefined {
  const a = process.env.PINATA_JWT?.trim()
  if (a) return a
  const b = process.env.PINATA_API_JWT?.trim()
  if (b) return b
  return undefined
}

/**
 * Estado de configuración (sin filtrar secretos). Útil para deshabilitar subidas en el cliente.
 */
export async function GET() {
  const configured = Boolean(pinataJwt())
  return NextResponse.json({ configured })
}

/**
 * Sube un archivo a Pinata (IPFS). Requiere `PINATA_JWT` o `PINATA_API_JWT` en el entorno del servidor.
 * No expone el JWT al cliente.
 */
export async function POST(req: NextRequest) {
  const jwt = pinataJwt()
  if (!jwt) {
    return NextResponse.json(
      {
        error:
          "Servidor sin PINATA_JWT. Copia `.env.local.example` a `.env.local`, pega tu JWT de Pinata (API Keys) y reinicia `next dev`.",
        hint: "cp .env.local.example .env.local",
      },
      { status: 503 },
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Cuerpo multipart inválido." }, { status: 400 })
  }

  const file = formData.get("file")
  if (!file || typeof file === "string" || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Falta el campo file." }, { status: 400 })
  }

  const pinataBody = new FormData()
  pinataBody.append("file", file)

  const pinRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: pinataBody,
  })

  const rawText = await pinRes.text()
  let parsed: { IpfsHash?: string; error?: { reason?: string } | string } = {}
  try {
    parsed = JSON.parse(rawText) as typeof parsed
  } catch {
    /* ignore */
  }

  if (!pinRes.ok) {
    const msg =
      typeof parsed.error === "object" && parsed.error?.reason
        ? parsed.error.reason
        : typeof parsed.error === "string"
          ? parsed.error
          : rawText.slice(0, 200) || `Pinata ${pinRes.status}`
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const hash = parsed.IpfsHash
  if (!hash || typeof hash !== "string") {
    return NextResponse.json({ error: "Pinata no devolvió IpfsHash." }, { status: 502 })
  }

  return NextResponse.json({ uri: `ipfs://${hash}` })
}

export const runtime = "nodejs"
