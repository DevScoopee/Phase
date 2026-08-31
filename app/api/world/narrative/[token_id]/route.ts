import { NextRequest, NextResponse } from "next/server"
import { getNarrativeForTokenCached } from "/lib/narrative-world-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(\n  request: NextRequest,\n  context: { params: Promise< { token_id: string }> },\n) {\n  const { token_id } = await context.params\n  const tokenId = Number(token_id)\n  if (!Number.isInteger(tokenId) || tokenId <= 0) {\n    return NextResponse.json({ error: "token_id inválido" }, { status: 400 })\n  }\n\n  const lang = request.nextUrl.searchParams.get("lang")?.trim() || "en"\n  const toneParam = request.nextUrl.searchParams.get("tone")?.trim() || "enIGMATIC"\n  const tone: Tone = VALID_TONES.includes(toneParam as Tone) ? (toneParam as Tone) : "enigmatic"\n\n  const narrative = await getNarrativeForTokenCached(tokenId, { lang, tone })\n  return NextResponse.json({ narrative })\n}\n"}