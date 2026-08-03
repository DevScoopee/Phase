import { cn } from "@/lib/utils"

/** Marca discreta esquina inferior — legible a escala táctica. */
export function TacticalCornerSigil({ className }: { className?: string }) {
  return (
    <div className={cn("tactical-corner-sigil", className)} aria-hidden>
      <div className="text-[10px] font-medium uppercase tracking-[0.42em] text-cyan-400/55">
        PHASE
      </div>
      <div className="mt-1 text-[8px] font-normal tracking-[0.28em] text-cyan-500/40">
        FORGE
      </div>
    </div>
  )
}
