"use client"

import { useState } from "react"

type ProfileSocials = {
  twitter?: string | null
  discord?: string | null
  telegram?: string | null
}

export function SocialChipsPublic({ profile }: { profile: ProfileSocials }) {
  const [discordCopied, setDiscordCopied] = useState(false)

  function copyDiscord() {
    if (!profile.discord) return
    void navigator.clipboard.writeText(profile.discord).then(() => {
      setDiscordCopied(true)
      setTimeout(() => setDiscordCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {profile.twitter && (
        <a
          href={`https://twitter.com/${profile.twitter.replace(/^@/, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        >
          <span
            className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-[2px]"
            style={{ background: "#000", fontSize: "7px", color: "#fff", fontWeight: 700 }}
          >
            𝕏
          </span>
          <span className="font-mono text-[9px] text-zinc-500">{profile.twitter}</span>
        </a>
      )}
      {profile.discord && (
        <button
          type="button"
          onClick={copyDiscord}
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          title="Copy Discord username"
        >
          <span
            className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-[2px]"
            style={{ background: "#5865F2", fontSize: "7px", color: "#fff", fontWeight: 700 }}
          >
            DC
          </span>
          <span className="font-mono text-[9px] text-zinc-500">
            {discordCopied ? "[ COPIED ]" : profile.discord}
          </span>
        </button>
      )}
      {profile.telegram && (
        <a
          href={`https://t.me/${profile.telegram.replace(/^@/, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        >
          <span
            className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-[2px]"
            style={{ background: "#0088cc", fontSize: "7px", color: "#fff", fontWeight: 700 }}
          >
            TG
          </span>
          <span className="font-mono text-[9px] text-zinc-500">{profile.telegram}</span>
        </a>
      )}
    </div>
  )
}
