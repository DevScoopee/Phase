import { Suspense } from "react"
import { ChamberBootFallback } from "@/components/chamber-boot-fallback"
import { FusionChamber } from "@/components/fusion-chamber"

export default function ChamberPage() {
  return (
    <Suspense fallback={<ChamberBootFallback />}>
      <FusionChamber />
    </Suspense>
  )
}
