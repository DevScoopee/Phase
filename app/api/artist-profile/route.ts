import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { StrKey } from "@stellar/stellar-sdk"
import { serverDataJsonPath } from "@/lib/server-data-paths"

type ArtistProfile = {
  alias: string
  updatedAt: number
}

type ArtistProfiles = Record<string, ArtistProfile>

const ALIAS_MIN = 3
const ALIAS_MAX = 24
const ALIAS_PATTERN = /^[A-Za-z0-9 _.-]+$/

function profilesFilePath() {
  return serverDataJsonPath("artistProfiles")
}

async function readProfiles(): Promise<ArtistProfiles> {
  try {
    const raw = await readFile(profilesFilePath(), "utf8")
    const parsed = JSON.parse(raw) as ArtistProfiles
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function writeProfiles(profiles: ArtistProfiles) {
  const file = profilesFilePath()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(profiles, null, 2), "utf8")
}

function normalizeAlias(input: string) {
  return input.trim().replace(/\s+/g, " ")
}

function validateAlias(alias: string): string | null {
  if (alias.length < ALIAS_MIN || alias.length > ALIAS_MAX) {
    return `Alias must be ${ALIAS_MIN}-${ALIAS_MAX} characters.`
  }
  if (!ALIAS_PATTERN.test(alias)) {
    return "Alias may only contain letters, numbers, spaces, ., -, and _."
  }
  return null
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("walletAddress")?.trim() ?? ""
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "walletAddress inválida." }, { status: 400 })
  }
  const profiles = await readProfiles()
  const profile = profiles[wallet] ?? null
  return NextResponse.json({
    walletAddress: wallet,
    alias: profile?.alias ?? null,
    updatedAt: profile?.updatedAt ?? null,
  })
}

export async function POST(req: NextRequest) {
  let body: { walletAddress?: string; alias?: string }
  try {
    body = (await req.json()) as { walletAddress?: string; alias?: string }
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
  }

  const wallet = body.walletAddress?.trim() ?? ""
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "walletAddress inválida." }, { status: 400 })
  }
  const aliasRaw = typeof body.alias === "string" ? normalizeAlias(body.alias) : ""
  const invalid = validateAlias(aliasRaw)
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 })
  }

  try {
    const profiles = await readProfiles()
    profiles[wallet] = { alias: aliasRaw, updatedAt: Date.now() }
    await writeProfiles(profiles)
    return NextResponse.json({
      ok: true,
      walletAddress: wallet,
      alias: aliasRaw,
      updatedAt: profiles[wallet].updatedAt,
    })
  } catch (err) {
    console.error("[artist-profile] POST write failed:", err)
    return NextResponse.json(
      {
        error:
          "No se pudo guardar el alias en el servidor. Si usas un volumen persistente, define PHASE_SERVER_DATA_DIR.",
      },
      { status: 503 },
    )
  }
}
