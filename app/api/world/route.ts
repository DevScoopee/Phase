import { NextRequest, NextResponse } from "next/server"
import { saveWorldForCollection } from "@/lib/narrative-world-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type WorldSaveBody = {
  collection_id?: unknown
  world_name?: unknown
  world_prompt?: unknown
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

export async function POST(request: NextRequest) {
  let body: WorldSaveBody
  try {
    body = (await request.json()) as WorldSaveBody
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const collectionId = Number(body.collection_id)
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "collection_id debe ser un entero positivo" }, { status: 400 })
  }

  if (!isNonEmptyString(body.world_name) || body.world_name.trim().length > 80) {
    return NextResponse.json(
      { error: "world_name es requerido y debe tener máximo 80 caracteres" },
      { status: 400 },
    )
  }

  if (!isNonEmptyString(body.world_prompt) || body.world_prompt.trim().length > 1000) {
    return NextResponse.json(
      { error: "world_prompt es requerido y debe tener máximo 1000 caracteres" },
      { status: 400 },
    )
  }

  await saveWorldForCollection(collectionId, {
    world_name: body.world_name.trim(),
    world_prompt: body.world_prompt.trim(),
  })

  return NextResponse.json({ ok: true, collection_id: collectionId })
}
