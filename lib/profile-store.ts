import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { serverDataJsonPath } from "@/lib/server-data-paths"

export type ProfileData = {
  display_name?: string
  twitter?: string
  discord?: string
  telegram?: string
  avatar_token_id?: number
  avatar_image_url?: string
  updated_at: number
}

type ProfileStore = Record<string, ProfileData>

async function readStore(): Promise<ProfileStore> {
  try {
    const raw = await readFile(serverDataJsonPath("profileSocials"), "utf8")
    return JSON.parse(raw) as ProfileStore
  } catch {
    return {}
  }
}

async function writeStore(data: ProfileStore): Promise<void> {
  const filePath = serverDataJsonPath("profileSocials")
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
}

export async function getProfile(wallet: string): Promise<ProfileData | null> {
  const store = await readStore()
  return store[wallet] ?? null
}

export async function saveProfile(
  wallet: string,
  data: Omit<ProfileData, "updated_at">,
): Promise<ProfileData> {
  const store = await readStore()
  const entry: ProfileData = {
    ...data,
    updated_at: Date.now(),
  }
  store[wallet] = entry
  await writeStore(store)
  return entry
}
