import { NextRequest, NextResponse } from "next/server"
import { getWorldForCollection } from "@/lib/narrative-world-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ collection_id: string }> },
) {
  const { collection_id } = await context.params
  const collectionId = Number(collection_id)
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "collection_id inválido" }, { status: 400 })
  }

  const world = await getWorldForCollection(collectionId)
  if (!world) {
    return NextResponse.json({ world: null }, { status: 200 })
  }

  return NextResponse.json({ world })
}
