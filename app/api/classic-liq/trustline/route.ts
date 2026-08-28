import { NextRequest, NextResponse } from "next/server"
import { Horizon, Networks, TransactionBuilder } from "@stellar/stellar-sdk"
import { z } from "zod"
import { HORIZON_URL } from "@/lib/phase-protocol"
import { logHorizonSubmitError } from "@/lib/stellar"
import { isFeatureEnabled } from "@/lib/feature-flags"

export const dynamic = 'force-dynamic'

// ─── phase-119: CID integrity schema (isolated, additive) ────────────────────
const TrustlinePostSchema = z.object({
  signedXdr: z.string().trim().min(10),
  // optional re-pinned content CID to verify before trustline submission
  cid: z.string().trim().min(4).max(128).regex(/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]+|bafk[a-z0-9]+).*/).optional().nullable(),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  // if the caller also sends bytesRef (gateway URL) we can fetch + verify; otherwise just validate format
  cidPath: z.string().trim().max(512).regex(/^[A-Za-z0-9._\/-]+$/).optional().nullable(),
})

function isPhase119Enabled(): boolean {
  return isFeatureEnabled("phase-119")
}

export async function POST(req: NextRequest) {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
  }

  const parsed = TrustlinePostSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: "signedXdr es requerido.", details: parsed.error.flatten() }, { status: 400 })
  }

  const signedXdr = parsed.data.signedXdr.trim()
  if (!signedXdr) {
    return NextResponse.json({ error: "signedXdr es requerido." }, { status: 400 })
  }

  // phase-119: optional CID integrity verification (additive, does not block legacy callers)
  if (isPhase119Enabled() && parsed.data.cid) {
    const cidStr = parsed.data.cid.trim()
    const expected = parsed.data.expectedSha256 ?? null
    // Validate CID format strictly
    const { CidSchema, verifyBytesIntegrity, sha256Hex, getCachedCid } = await import("@/lib/cid-cache")
    const cidCheck = CidSchema.safeParse(cidStr)
    if (!cidCheck.success) {
      return NextResponse.json({ error: `Invalid CID: ${cidStr.slice(0, 12)}…`, code: "CID_INVALID" }, { status: 400 })
    }
    // If cidPath provided, fetch and verify tampering
    if (parsed.data.cidPath) {
      try {
        const { fetchWithCidCache } = await import("@/lib/cid-cache")
        const fetched = await fetchWithCidCache(parsed.data.cidPath, { expectedSha256: expected })
        if (!fetched.ok) {
          return NextResponse.json({ error: fetched.error, code: fetched.code, cid: cidStr }, { status: 409 })
        }
        // verified — continue to trustline submission
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : String(e), code: "CID_VERIFY_FAILED" }, { status: 409 })
      }
    } else if (expected) {
      // CID + expected hash supplied without bytes: check cache integrity
      try {
        const cached = await getCachedCid(cidStr, { expectedSha256: expected })
        if (cached && !verifyBytesIntegrity(cached.bytes, expected)) {
          return NextResponse.json({ error: `Cached CID ${cidStr.slice(0, 8)}… fails integrity check`, code: "HASH_MISMATCH" }, { status: 409 })
        }
        // if not cached, we allow submission but warn via header later
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: msg, code: "CID_TAMPERED" }, { status: 409 })
      }
    }
  }

  try {
    const server = new Horizon.Server(HORIZON_URL)
    const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET)
    const submit = await server.submitTransaction(tx)
    // phase-119 observability headers
    const headers: Record<string, string> = {}
    if (isPhase119Enabled()) {
      headers["X-Phase119"] = "enabled"
      if (parsed.data.cid) headers["X-Phase-CID"] = parsed.data.cid.slice(0, 16)
    }
    return NextResponse.json({ ok: true, hash: submit.hash }, { headers })
  } catch (e) {
    logHorizonSubmitError("classic-liq/trustline submit", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}

// GET exposes cache stats when flag enabled (observability, zero regression when off)
export async function GET() {
  if (!isPhase119Enabled()) {
    return NextResponse.json({ enabled: false, error: "phase-119 flag disabled" }, { status: 404 })
  }
  try {
    const { getCidCacheStats } = await import("@/lib/cid-cache")
    const stats = getCidCacheStats()
    return NextResponse.json({ enabled: true, ...stats })
  } catch (e) {
    return NextResponse.json({ enabled: true, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
