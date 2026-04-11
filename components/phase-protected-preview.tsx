"use client"

import { IpfsDisplayImg } from "@/components/ipfs-display-img"
import { cn } from "@/lib/utils"
import { viewerSignatureShort } from "@/lib/viewer-signature"

export type PhaseProtectedPreviewLabels = {
  pendingFusion: string
  unverifiedCopy: string
  chainVerifiedSeal: string
}

type Props = {
  /** `ipfs://…` o HTTPS (p. ej. metadatos / gateway); reintenta gateways si uno falla. */
  uri: string
  className?: string
  /** Dueño on-chain de la utilidad PHASE para esta colección (wallet conectada). */
  chainVerified: boolean
  /** Wallet conectada (para sello que varía por visor). */
  viewerAddress: string | null | undefined
  labels: PhaseProtectedPreviewLabels
}

/**
 * Mercado / listado: miniatura degradada + scanlines + PENDING_FUSION si no hay prueba on-chain.
 * Si `chainVerified`, muestra arte más nítido y sello de cadena (HD reservado al Reactor).
 */
export function PhaseProtectedPreview({ uri, className, chainVerified, viewerAddress, labels }: Props) {
  const sig = viewerSignatureShort(viewerAddress)

  return (
    <div
      className={cn(
        "relative isolate flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-[oklch(0.04_0_0)]",
        className,
      )}
    >
      <IpfsDisplayImg
        uri={uri}
        className={cn(
          "relative z-0 max-h-full max-w-full object-contain p-2 transition-[filter] duration-300",
          chainVerified
            ? "max-h-[min(100%,220px)] [image-rendering:auto]"
            : "phase-protected-preview--lowres max-h-[120px] scale-[1.35] opacity-90 [image-rendering:crisp-edges]",
        )}
        loading="lazy"
      />

      {!chainVerified && (
        <>
          <div className="phase-dashboard-scanlines pointer-events-none absolute inset-0 z-[2]" aria-hidden />
          <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center bg-black/25" aria-hidden>
            <span className="max-w-[90%] border border-orange-500/50 bg-orange-950/75 px-2 py-1.5 text-center font-mono text-[8px] font-bold uppercase leading-tight tracking-[0.2em] text-orange-200/95 shadow-[0_0_20px_rgba(234,88,12,0.2)]">
              {labels.pendingFusion}
            </span>
          </div>
        </>
      )}

      <div
        className={cn(
          "pointer-events-none absolute bottom-1.5 right-1.5 z-[4] max-w-[calc(100%-0.75rem)] border px-1.5 py-0.5 font-mono text-[6px] font-bold uppercase leading-tight tracking-tighter shadow-md sm:text-[7px]",
          chainVerified
            ? "border-emerald-500/55 bg-emerald-950/90 text-emerald-200/95"
            : "border-orange-500/50 bg-black/85 text-orange-300/90",
        )}
      >
        {chainVerified ? (
          <span>
            {labels.chainVerifiedSeal} · SIG:{sig}
          </span>
        ) : (
          <span>
            {labels.unverifiedCopy} · {sig}
          </span>
        )}
      </div>
    </div>
  )
}
