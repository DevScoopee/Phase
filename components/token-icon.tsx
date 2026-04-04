"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

type TokenIconProps = {
  className?: string
  pulse?: boolean
}

export function TokenIcon({ className, pulse = false }: TokenIconProps) {
  return (
    <span
      className={cn(
        "token-icon-glow inline-flex items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-950/25 p-[1px]",
        pulse && "token-icon-pulse",
        className,
      )}
      aria-hidden
    >
      <Image
        src="/phaser-liq-token.png"
        alt=""
        width={16}
        height={16}
        className="h-full w-full rounded-full object-cover"
        priority={false}
      />
    </span>
  )
}
