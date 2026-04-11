"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { LangToggle } from "@/components/lang-toggle"
import { useLang } from "@/components/lang-context"
import { PhaseProtectedPreview } from "@/components/phase-protected-preview"
import { useWallet } from "@/components/wallet-provider"
import { cn } from "@/lib/utils"
import type { ExploreItem } from "@/app/api/explore/route"

type ExploreResponse = {
  items: ExploreItem[]
  total: number
  page: number
  perPage: number
}

const navLink =
  "inline-flex min-h-[36px] items-center border-2 border-cyan-400/50 bg-cyan-950/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.12)] transition-colors hover:border-cyan-300 hover:bg-cyan-900/40 hover:text-white"

const PREVIEW_LABELS = {
  pendingFusion: "[ PREVIEW_ONLY ]",
  unverifiedCopy: "[ UNVERIFIED ]",
  chainVerifiedSeal: "[ VERIFIED ]",
}

export default function ExplorePage() {
  const { lang } = useLang()
  const { address } = useWallet()

  const [data, setData] = useState<ExploreResponse | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle")
  const [page, setPage] = useState(1)
  const perPage = 24

  const load = useCallback(async (p: number) => {
    setLoadState("loading")
    try {
      const res = await fetch(`/api/explore?page=${p}&perPage=${perPage}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ExploreResponse
      setData(json)
      setLoadState("idle")
    } catch {
      setLoadState("error")
    }
  }, [])

  useEffect(() => {
    void load(page)
  }, [load, page])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / perPage)) : 1

  const isEs = lang === "es"

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <div className="grid-bg pointer-events-none fixed inset-0 opacity-40" aria-hidden />

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b-4 border-double border-cyan-400/55 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className={navLink}>
            {isEs ? "← Inicio" : "← Home"}
          </Link>
        </div>
        <span className="text-center text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200">
          ◈ PHASE · {isEs ? "EXPLORAR" : "EXPLORE"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <LangToggle variant="phosphor" />
          <Link href="/forge" className={navLink}>
            {isEs ? "Forja" : "Forge"}
          </Link>
          <Link href="/dashboard" className={navLink}>
            {isEs ? "Mercado" : "Market"}
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 md:py-12">
        <div className="border-4 border-double border-cyan-400/55 bg-[oklch(0.05_0_0)] p-6 shadow-[0_0_32px_rgba(0,255,255,0.06)] md:p-8">
          <div className="mb-6 border-b border-cyan-400/30 pb-6">
            <h1 className="tactical-phosphor text-[13px] font-bold uppercase tracking-[0.28em] text-cyan-200">
              ◈ {isEs ? "ARTEFACTOS DE LA COMUNIDAD" : "COMMUNITY_ARTIFACTS"}
            </h1>
            <p className="mt-2 text-[10px] leading-relaxed text-cyan-300/80">
              {isEs
                ? "Todos los NFTs minteados en el protocolo PHASE — con marca de agua. Conectá tu wallet en Chamber para verificar los tuyos."
                : "All NFTs minted on the PHASE protocol — watermarked. Connect your wallet in Chamber to verify yours."}
            </p>
            {data && (
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-500/70">
                {isEs ? `TOTAL_ESTABILIZADOS` : `TOTAL_STABILIZED`}
                {" · "}
                <span className="text-cyan-300/90">{data.total}</span>
                {" · "}
                {isEs ? `PÁGINA ${page} / ${totalPages}` : `PAGE ${page} / ${totalPages}`}
              </p>
            )}
          </div>

          {loadState === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/60 border-t-transparent" />
              <p className="animate-pulse font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-400/75">
                {isEs ? "ESCANEANDO_LEDGER…" : "SCANNING_LEDGER…"}
              </p>
            </div>
          )}

          {loadState === "error" && (
            <p className="py-10 text-center font-mono text-[10px] uppercase tracking-widest text-red-400/90">
              {isEs ? "[ ERROR_RPC — REINTENTÁ ]" : "[ RPC_ERROR — RETRY ]"}
            </p>
          )}

          {loadState === "idle" && data && data.items.length === 0 && (
            <p className="py-10 text-center font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
              {isEs ? "NO_SE_DETECTAN_ARTEFACTOS" : "NO_ARTIFACTS_DETECTED"}
            </p>
          )}

          {loadState === "idle" && data && data.items.length > 0 && (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {data.items.map((item) => (
                  <li
                    key={item.tokenId}
                    className="flex flex-col border-2 border-cyan-500/35 bg-black/55 shadow-[inset_0_1px_0_rgba(34,211,238,0.08)]"
                  >
                    <div className="border-b border-cyan-500/25">
                      <PhaseProtectedPreview
                        uri={item.image}
                        chainVerified={false}
                        viewerAddress={address}
                        labels={PREVIEW_LABELS}
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-3">
                      <p className="line-clamp-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-50">
                        {item.name}
                      </p>
                      <p className="tactical-phosphor text-[9px] font-bold uppercase tracking-wider text-cyan-400">
                        SERIAL_ID #{item.tokenId}
                      </p>
                      <p className="text-[9px] text-cyan-300/70">
                        {isEs ? "Titular" : "Holder"}{" "}
                        <span className="font-mono text-cyan-200/80">{item.ownerTruncated}</span>
                      </p>
                      {item.collectionId != null && item.collectionId > 0 && (
                        <div className="mt-auto pt-2">
                          <Link
                            href={`/chamber?collection=${item.collectionId}`}
                            className={cn(navLink, "w-full justify-center border-cyan-500/40 text-[9px]")}
                          >
                            {isEs ? "Abrir Chamber" : "Open Chamber"}
                          </Link>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={cn(navLink, "disabled:cursor-not-allowed disabled:opacity-40")}
                  >
                    ← {isEs ? "Ant." : "Prev"}
                  </button>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400/80">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={cn(navLink, "disabled:cursor-not-allowed disabled:opacity-40")}
                  >
                    {isEs ? "Sig." : "Next"} →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
