import { NextRequest, NextResponse } from "next/server"
import { phaseProtocolContractIdForServer } from "@/lib/phase-protocol"
import { fetchMercuryEvents, parseMintTransferEvents } from "@/lib/mercury-classic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
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

  const sp = req.nextUrl.searchParams
  const eventFilter = sp.get("event")?.toLowerCase() ?? null
  const ownerFilter = sp.get("owner")?.trim() ?? null
  const limit = Math.min(Number(sp.get("limit") ?? "1000"), 1000)
  const offset = Number(sp.get("offset") ?? "0")
  const from = sp.get("from") ? Number(sp.get("from")) : undefined
  const to = sp.get("to") ? Number(sp.get("to")) : undefined

  if (eventFilter && !["mint", "transfer"].includes(eventFilter)) {
    return NextResponse.json(
      { error: "Invalid event filter. Use: mint | transfer" },
      { status: 400 },
    )
  }

  let rawEvents: Awaited<ReturnType<typeof fetchMercuryEvents>>
  try {
    rawEvents = await fetchMercuryEvents(contractId, { limit, offset, from, to })
  } catch (e) {
    return NextResponse.json(
      { error: "Mercury query failed.", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }

  let events = parseMintTransferEvents(rawEvents)

  if (eventFilter) {
    events = events.filter((e) => e.type === eventFilter)
  }

  if (ownerFilter) {
    const upper = ownerFilter.toUpperCase()
    events = events.filter((e) => {
      if (e.type === "mint") return e.recipient.toUpperCase() === upper
      return e.from.toUpperCase() === upper || e.to.toUpperCase() === upper
    })
  }

  return NextResponse.json(
    {
      contractId,
      total: events.length,
      rawTotal: rawEvents.length,
      indexedVia: "mercury-classic",
      events,
    },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "private, no-store",
      },
    },
  )
}
