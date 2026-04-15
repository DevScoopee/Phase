import { NextRequest, NextResponse } from "next/server"
import {
  getAllWorldCollections,
  getAllNarrativesCount,
  countCollectorsInWorlds,
  getRecentNarrativesForCollection,
  saveWorldForCollection,
  type NarratorTone,
} from "@/lib/narrative-world-store"

export type WorldsListItem = {
  collectionId: number
  world_name: string
  world_prompt: string
  created_at: number
  narrativeCount: number
  latestNarrative: string | null
  narrator_tone?: NarratorTone
}

export type WorldsGlobalStats = {
  worldsActive: number
  totalArtifacts: number
  narrativesGenerated: number
  collectors: number
}

export async function GET() {
  const store = await getAllWorldCollections()
  const items: WorldsListItem[] = await Promise.all(
    Object.entries(store).map(async ([id, data]) => {
      const narratives = await getRecentNarrativesForCollection(Number(id), 50)
      return {
        collectionId: Number(id),
        world_name: data.world_name,
        world_prompt: data.world_prompt,
        created_at: data.created_at,
        narrativeCount: narratives.length,
        latestNarrative: narratives[0]?.narrative ?? null,
        narrator_tone: data.narrator_tone,
      }
    }),
  )
  items.sort((a, b) => b.collectionId - a.collectionId)

  const activeCollectionIds = items.map((w) => w.collectionId)
  const [totalArtifacts, collectors] = await Promise.all([
    getAllNarrativesCount(),
    countCollectorsInWorlds(activeCollectionIds),
  ])
  const narrativesGenerated = items.reduce((sum, w) => sum + w.narrativeCount, 0)
  const globalStats: WorldsGlobalStats = {
    worldsActive: items.length,
    totalArtifacts,
    narrativesGenerated,
    collectors,
  }

  return NextResponse.json({ items, globalStats })
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VALID_TONES: NarratorTone[] = ["enigmatic", "epic", "scientific", "folkloric"]

type WorldSaveBody = {
  collection_id?: unknown
  world_name?: unknown
  world_prompt?: unknown
  narrator_tone?: unknown
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

function isValidTone(v: unknown): v is NarratorTone {
  return typeof v === "string" && (VALID_TONES as string[]).includes(v)
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

  if (body.narrator_tone !== undefined && !isValidTone(body.narrator_tone)) {
    return NextResponse.json(
      { error: `narrator_tone inválido. Valores permitidos: ${VALID_TONES.join(", ")}` },
      { status: 400 },
    )
  }

  await saveWorldForCollection(collectionId, {
    world_name: body.world_name.trim(),
    world_prompt: body.world_prompt.trim(),
    narrator_tone: isValidTone(body.narrator_tone) ? body.narrator_tone : undefined,
  })

  return NextResponse.json({ ok: true, collection_id: collectionId })
}
