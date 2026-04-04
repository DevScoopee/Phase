"use client"

import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"

type TokenIconProps = {
  className?: string
  pulse?: boolean
}

export function TokenIcon({ className, pulse = false }: TokenIconProps) {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <span
      className={cn(
        "token-icon-glow inline-flex items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-950/25 p-[1px]",
        pulse && "token-icon-pulse",
        className,
      )}
      aria-hidden
    >
      {imgFailed ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-700 text-[9px] font-bold leading-none text-white">
          P
        </span>
      ) : (
        <Image
          src="/phaser-liq-token.png"
          alt=""
          width={16}
          height={16}
          className="h-full w-full rounded-full object-contain"
          priority={false}
          onError={() => setImgFailed(true)}
        />
      )}
    </span>
  )
}
