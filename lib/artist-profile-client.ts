export async function fetchArtistAlias(walletAddress: string): Promise<string | null> {
  if (!walletAddress) return null
  try {
    const res = await fetch(`/api/artist-profile?walletAddress=${encodeURIComponent(walletAddress)}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json().catch(() => ({}))) as { alias?: string | null }
    if (typeof data.alias === "string" && data.alias.trim().length > 0) return data.alias.trim()
    return null
  } catch {
    return null
  }
}
