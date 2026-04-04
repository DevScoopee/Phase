import { randomUUID } from "crypto"
import { promises as fs } from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"

const DATA_FILE = process.env.NFT_LISTINGS_FILE?.trim() || ".data/nft-listings.json"

type Listing = {
  id: string
  seller: string
  collectionId: number
  tokenId: number
  priceStroops: string
  createdAt: string
  active: boolean
}

function dataPath() {
  return path.join(process.cwd(), DATA_FILE)
}

async function readListings(): Promise<Listing[]> {
  try {
    const raw = await fs.readFile(dataPath(), "utf8")
    const j = JSON.parse(raw) as { listings?: Listing[] }
    return Array.isArray(j.listings) ? j.listings : []
  } catch {
    return []
  }
}

async function writeListings(listings: Listing[]) {
  const p = dataPath()
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify({ listings }, null, 2), "utf8")
}

function validG(addr: string) {
  const t = addr.trim()
  return t.length === 56 && t.startsWith("G") && StrKey.isValidEd25519PublicKey(t)
}

/** Listados públicos de venta (testnet / demo). El pago PHASER_LIQ es P2P; la transferencia NFT es on-chain vía `transfer_phase_nft`. */
export async function GET() {
  const listings = (await readListings()).filter((l) => l.active)
  return NextResponse.json({ listings })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<{
    seller: string
    collectionId: number
    tokenId: number
    priceStroops: string
    cancelId: string
  }> | null
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })

  const cancelId = typeof body.cancelId === "string" ? body.cancelId.trim() : ""
  if (cancelId) {
    const all = await readListings()
    const next = all.map((l) => (l.id === cancelId ? { ...l, active: false } : l))
    await writeListings(next)
    return NextResponse.json({ ok: true })
  }

  const seller = body.seller?.trim() ?? ""
  const collectionId = Number(body.collectionId)
  const tokenId = Number(body.tokenId)
  const priceStroops = String(body.priceStroops ?? "").trim() || "0"

  if (!validG(seller)) {
    return NextResponse.json({ ok: false, error: "Invalid seller address" }, { status: 400 })
  }
  if (!Number.isFinite(collectionId) || collectionId < 0) {
    return NextResponse.json({ ok: false, error: "Invalid collectionId" }, { status: 400 })
  }
  if (!Number.isFinite(tokenId) || tokenId < 1) {
    return NextResponse.json({ ok: false, error: "Invalid tokenId" }, { status: 400 })
  }
  try {
    if (BigInt(priceStroops) < BigInt(0)) throw new Error("neg")
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid priceStroops" }, { status: 400 })
  }

  const all = await readListings()
  const deactivated = all.map((l) => {
    if (l.active && l.seller === seller && l.tokenId === tokenId && l.collectionId === collectionId) {
      return { ...l, active: false }
    }
    return l
  })
  const listing: Listing = {
    id: randomUUID(),
    seller,
    collectionId,
    tokenId,
    priceStroops,
    createdAt: new Date().toISOString(),
    active: true,
  }
  await writeListings([...deactivated, listing])
  return NextResponse.json({ ok: true, listing })
}
