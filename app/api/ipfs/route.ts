import { NextRequest, NextResponse } from "next/server"

function pinataJwt(): string | undefined {
  const a = process.env.PINATA_JWT?.trim()
  if (a) return a
  const b = process.env.PINATA_API_JWT?.trim()
  if (b) return b
  return undefined
}

/** Returns whether server-side file upload is available (no secrets exposed). */
export async function GET() {
  const configured = Boolean(pinataJwt())
  return NextResponse.json({ configured })
}

/** Accepts multipart `file`; stores via configured provider. JWT never sent to the client. */
export async function POST(req: NextRequest) {
  const jwt = pinataJwt()
  if (!jwt) {
    return NextResponse.json({ error: "La subida de imágenes no está configurada en el servidor." }, { status: 503 })
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

  const uploadForm = new FormData()
  uploadForm.append("file", file)

  const pinRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: uploadForm,
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
          : rawText.slice(0, 200) || `Upload service ${pinRes.status}`
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const hash = parsed.IpfsHash
  if (!hash || typeof hash !== "string") {
    return NextResponse.json({ error: "La subida no devolvió un identificador válido." }, { status: 502 })
  }

  return NextResponse.json({ uri: `ipfs://${hash}` })
}

export const runtime = "nodejs"
