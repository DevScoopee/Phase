import { NextResponse } from "next/server"

/**
 * NanoBanana API exige `callBackUrl` en POST /generate; pueden notificar aquí al terminar.
 * El forja usa polling a `record-info`; este endpoint solo confirma recepción (200).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await request.text()
  } catch {
    /* ignore */
  }
  return new NextResponse(null, { status: 200 })
}
