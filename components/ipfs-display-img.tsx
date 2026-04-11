"use client"

import { ipfsHttpsGatewayUrls } from "@/lib/phase-protocol"
import { useEffect, useMemo, useState } from "react"

type Props = {
  uri: string
  alt?: string
  className?: string
  loading?: "lazy" | "eager"
  /** Se llama cuando ningún gateway devolvió imagen válida. */
  onExhausted?: () => void
}

export function IpfsDisplayImg({ uri, alt = "", className, loading = "lazy", onExhausted }: Props) {
  const candidates = useMemo(() => ipfsHttpsGatewayUrls(uri), [uri])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    setIdx(0)
  }, [uri])

  const src = candidates[idx] ?? ""

  if (!uri.trim() || !src) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote IPFS / HTTPS previews
    <img
      key={`${uri}:${idx}`}
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => {
        if (idx + 1 < candidates.length) {
          setIdx((i) => i + 1)
        } else {
          onExhausted?.()
        }
      }}
    />
  )
}
