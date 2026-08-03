import { NextRequest, NextResponse } from "next/server"
import { phaseProtocolContractIdForServer } from "@/lib/phase-protocol"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function mercuryRestBase(): string {
  return (
    process.env.MERCURY_REST_URL?.trim() ??
    "https://api.mercurydata.app/rest"
  )
}

/**
 * POST /api/nft-index/subscribe
 *
 * Registra un webhook en Mercury para recibir eventos del contrato PHASE en tiempo real.
 * Body JSON: { "webhookUrl": "https://tu-dominio.com/api/webhooks/mercury" }
 * Requiere header `x-admin-key` igual a `PHASE_ADMIN_KEY` si está definida.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const adminKey = process.env.PHASE_ADMIN_KEY?.trim()
  if (adminKey) {
    const provided = req.headers.get("x-admin-key")?.trim()
    if (provided !== adminKey) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }
  }

  const jwt = process.env.MERCURY_JWT?.trim()
  if (!jwt) {
    return NextResponse.json({ error: "MERCURY_JWT not configured." }, { status: 503 })
  }

  const contractId = (() => {
    try {
      return phaseProtocolContractIdForServer()
    } catch {
      return null
    }
  })()

  if (!contractId) {
    return NextResponse.json(
      { error: "PHASE contract not configured (NEXT_PUBLIC_PHASE_PROTOCOL_ID)." },
      { status: 503 },
    )
  }

  let body: { webhookUrl?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const webhookUrl = body.webhookUrl?.trim()
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Missing required field: webhookUrl" },
      { status: 400 },
    )
  }

  const res = await fetch(`${mercuryRestBase()}/webhooks/new`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      webhook_endpoint: webhookUrl,
      contract_id: contractId,
    }),
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    return NextResponse.json(
      { error: "Mercury webhook registration failed.", detail: json, status: res.status },
      { status: 502 },
    )
  }

  return NextResponse.json({
    ok: true,
    contractId,
    webhookUrl,
    mercury: json,
    note: "Guardá el 'secret' que devuelve Mercury — solo se muestra una vez.",
  })
}

/**
 * GET /api/nft-index/subscribe
 * Lista los webhooks registrados en Mercury para esta cuenta.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const adminKey = process.env.PHASE_ADMIN_KEY?.trim()
  if (adminKey) {
    const provided = req.headers.get("x-admin-key")?.trim()
    if (provided !== adminKey) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }
  }

  const jwt = process.env.MERCURY_JWT?.trim()
  if (!jwt) {
    return NextResponse.json({ error: "MERCURY_JWT not configured." }, { status: 503 })
  }

  const res = await fetch(`${mercuryRestBase()}/webhooks/list`, {
    headers: { Authorization: `Bearer ${jwt}` },
    cache: "no-store",
  })

  const json = await res.json().catch(() => null)
  return NextResponse.json(json, { status: res.status })
}
