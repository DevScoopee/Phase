import { NextRequest, NextResponse } from "next/server"
import { getNarrativeForToken } from "@/lib/narrative-world-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token_id: string }> },
) {
  const { token_id } = await context.params
  const tokenId = Number(token_id)
  if (!Number.isInteger(tokenId) || tokenId <= 0) {
    return NextResponse.json({ error: "token_id inválido" }, { status: 400 })
  }

  const narrative = await getNarrativeForToken(tokenId)
  return NextResponse.json({ narrative })
}
