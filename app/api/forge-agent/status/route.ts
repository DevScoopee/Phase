import { NextRequest, NextResponse } from "next/server"
import { getJob, listJobs } from "@/lib/forge/job-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim()
  if (id) {
    const job = getJob(id)
    if (!job) return NextResponse.json({ success: false, error: "job not found" }, { status: 404 })
    return NextResponse.json({ success: true, job })
  }
  return NextResponse.json({ success: true, jobs: listJobs().slice(0, 20) })
}
