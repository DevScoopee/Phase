import path from "node:path"

/** Fixed `.data` segment + literal filenames so Next/Vercel file tracing does not pull in the whole repo. */
const DATA_DIR = ".data" as const

const FILES = {
  nftListings: "nft-listings.json",
  faucetClaims: "faucet-claims.json",
  classicLiqClaims: "classic-liq-claims.json",
  artistProfiles: "artist-profiles.json",
} as const

export type ServerDataFile = keyof typeof FILES

export function serverDataJsonPath(key: ServerDataFile): string {
  return path.join(process.cwd(), DATA_DIR, FILES[key])
}
