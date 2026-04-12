import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai"
import { NextRequest, NextResponse } from "next/server"
import {
  getWorldForCollection,
  getRecentNarrativesForCollection,
  saveNarrativeForToken,
  getNarrativeForToken,
} from "@/lib/narrative-world-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const SAFETY_SETTINGS = (
  [
    HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    HarmCategory.HARM_CATEGORY_HARASSMENT,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
  ] as const
).map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }))

function narratorGeminiApiKey(): string | null {
  const studio = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim().replace(/^["']|["']$/g, "")
  const legacy = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, "")
  const key = studio?.startsWith("AIza") && studio.length >= 35 ? studio : legacy
  return key && key.length >= 35 ? key : null
}

function narratorModelId(): string {
  const fromEnv = process.env.GEMINI_MODEL?.trim().replace(/^models\//i, "").trim()
  if (fromEnv && fromEnv.length > 0) return fromEnv
  return "gemini-2.5-flash"
}

type NarratorBody = {
  token_id?: unknown
  collection_id?: unknown
  lore?: unknown
}

export async function POST(request: NextRequest) {
  let body: NarratorBody
  try {
    body = (await request.json()) as NarratorBody
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const tokenId = Number(body.token_id)
  const collectionId = Number(body.collection_id)

  if (!Number.isInteger(tokenId) || tokenId <= 0) {
    return NextResponse.json({ error: "token_id inválido" }, { status: 400 })
  }
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "collection_id inválido" }, { status: 400 })
  }

  // Idempotent: if narrative already exists, return it without re-generating.
  const existing = await getNarrativeForToken(tokenId)
  if (existing) {
    return NextResponse.json({ ok: true, narrative: existing.narrative, cached: true })
  }

  const world = await getWorldForCollection(collectionId)
  if (!world) {
    return NextResponse.json(
      { error: "Esta colección no tiene mundo narrativo activo" },
      { status: 404 },
    )
  }

  const apiKey = narratorGeminiApiKey()
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_AI_STUDIO_API_KEY no configurada" }, { status: 503 })
  }

  const loreInput = typeof body.lore === "string" ? body.lore.trim() : ""
  const recentNarratives = await getRecentNarrativesForCollection(collectionId, 2)
  const previousContext =
    recentNarratives.length > 0
      ? `\n\nConexiones narrativas anteriores en este mundo:\n${recentNarratives.map((n, i) => `${i + 1}. ${n.narrative}`).join("\n")}`
      : ""

  const systemPrompt =
    `Eres el Narrador del mundo "${world.world_name}". ` +
    `Contexto del mundo: ${world.world_prompt}` +
    previousContext +
    `\n\nUn nuevo artefacto acaba de ser forjado en este mundo` +
    (loreInput ? `: "${loreInput}"` : ".") +
    ` Escribe exactamente 2-3 oraciones que conecten este artefacto con el mundo narrativo. ` +
    `Tono: enigmático, literario, coherente con el lore del mundo. Sin encabezados ni markdown.`

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel(
    {
      model: narratorModelId(),
      safetySettings: SAFETY_SETTINGS,
    },
    { apiVersion: "v1beta" },
  )

  let narrative: string
  try {
    const result = await model.generateContent(systemPrompt)
    narrative = result.response.text().trim()
    if (!narrative) {
      return NextResponse.json({ error: "Gemini no devolvió texto" }, { status: 500 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[narrator] Gemini failed", { tokenId, collectionId, msg })
    return NextResponse.json({ error: `Gemini error: ${msg}` }, { status: 500 })
  }

  await saveNarrativeForToken(tokenId, {
    narrative,
    collection_id: collectionId,
    lore_input: loreInput,
  })

  return NextResponse.json({ ok: true, narrative })
}
