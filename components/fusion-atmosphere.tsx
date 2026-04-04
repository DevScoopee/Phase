"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

function ringDots(r: number, startDeg: number, step: number, radii: number[], opacities: number[]) {
  const dots: ReactNode[] = []
  let idx = 0
  for (let deg = startDeg; deg < startDeg + 360; deg += step) {
    const rad = (deg * Math.PI) / 180
    const x = r * Math.cos(rad)
    const y = r * Math.sin(rad)
    const ri = radii[idx % radii.length]
    const o = opacities[idx % opacities.length]
    dots.push(<circle key={`${r}-${deg}`} cx={x} cy={y} r={ri} fill="currentColor" opacity={o} />)
    idx++
  }
  return dots
}

/** Subtle “fusion” motif: converging beams + slow orbit — sits behind hero copy */
export function FusionAtmosphere({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none select-none fusion-atmosphere-wrap", className)}
      aria-hidden
    >
      <svg
        viewBox="0 0 200 200"
        className="h-[min(42vw,11rem)] w-[min(42vw,11rem)] md:h-44 md:w-44 text-accent/55"
        fill="none"
      >
        <g className="fusion-beams" stroke="currentColor" strokeWidth={0.45} opacity={0.4}>
          <line x1="0" y1="38" x2="100" y2="100" className="fusion-beam fusion-beam-a" />
          <line x1="200" y1="52" x2="100" y2="100" className="fusion-beam fusion-beam-b" />
          <line x1="102" y1="200" x2="100" y2="100" className="fusion-beam fusion-beam-c" />
        </g>
        <g transform="translate(100 100)">
          <circle cx={0} cy={0} r={2.5} className="fusion-core" fill="currentColor" />
          <g className="fusion-orbit-ring">{ringDots(52, 0, 45, [1.15, 0.85], [0.22, 0.14, 0.2, 0.16])}</g>
          <g className="fusion-orbit-ring-slow">
            {ringDots(34, 22, 45, [0.65], [0.12, 0.18, 0.1, 0.15])}
          </g>
        </g>
      </svg>
    </div>
  )
}
