"use client"

import Link from "next/link"
import { useRef, useEffect, useMemo } from "react"
import { useLang } from "@/components/lang-context"
import { pickLandingCopy } from "@/lib/landing-copy"
import { cn } from "@/lib/utils"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

const colophonPanel =
  "relative overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-b from-cyan-950/[0.22] via-black/40 to-black/60 p-5 shadow-[inset_0_1px_0_rgba(34,211,238,0.08),0_4px_24px_rgba(0,0,0,0.45)] transition-[border-color,box-shadow] duration-300 hover:border-cyan-400/35 hover:shadow-[inset_0_1px_0_rgba(34,211,238,0.12),0_0_28px_rgba(34,211,238,0.06)]"

const colophonLabel =
  "mb-4 flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.32em] text-cyan-400/75"

export function ColophonSection() {
  const { lang } = useLang()
  const c = useMemo(() => pickLandingCopy(lang).colophon, [lang])

  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current) return

    const ctx = gsap.context(() => {
      // Header slide in
      if (headerRef.current) {
        gsap.from(headerRef.current, {
          x: -60,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      // Grid columns fade up with stagger
      if (gridRef.current) {
        const columns = gridRef.current.querySelectorAll(":scope > div")
        gsap.from(columns, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: gridRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      // Footer fade in
      if (footerRef.current) {
        gsap.from(footerRef.current, {
          y: 20,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: footerRef.current,
            start: "top 95%",
            toggleActions: "play none none reverse",
          },
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [lang])

  return (
    <section
      ref={sectionRef}
      id="colophon"
      className="relative overflow-hidden border-t border-cyan-500/15 py-20 md:py-28"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(34, 211, 238, 0.06), transparent 55%), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(234, 88, 12, 0.04), transparent 50%)",
        }}
      />

      <div className="relative z-[1]">
        {/* Section header */}
        <div ref={headerRef} className="mb-10 md:mb-14 max-w-3xl">
          <span className="inline-block font-mono text-[10px] uppercase tracking-[0.28em] text-orange-400/90">
            {c.sectionEyebrow}
          </span>
          <h2 className="mt-3 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground sm:text-5xl md:text-6xl md:leading-[0.95]">
            {c.sectionTitle}
          </h2>
          <div className="mt-4 h-px max-w-[12rem] bg-gradient-to-r from-cyan-400/50 via-cyan-400/20 to-transparent" />
        </div>

        {/* Multi-column layout — tighter rhythm, max width so columns don’t feel lost on ultra-wide */}
        <div
          ref={gridRef}
          className="mx-auto grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4 lg:gap-5 xl:gap-6"
        >
          <div className={cn(colophonPanel, "col-span-1")}>
            <h4 className={colophonLabel}>
              <span className="text-cyan-300/90" aria-hidden>
                ◈
              </span>
              {c.networkLabel}
            </h4>
            <ul className="space-y-2.5">
              {c.networkLines.map((line) => (
                <li
                  key={line}
                  className="border-l-2 border-cyan-500/25 pl-3 font-mono text-[12px] leading-snug text-cyan-100/90"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className={cn(colophonPanel, "col-span-1")}>
            <h4 className={colophonLabel}>
              <span className="text-cyan-300/90" aria-hidden>
                ◈
              </span>
              {c.standardLabel}
            </h4>
            <ul className="space-y-2.5">
              {c.standardLines.map((line) => (
                <li
                  key={line}
                  className="border-l-2 border-cyan-500/25 pl-3 font-mono text-[12px] leading-snug text-cyan-100/90"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div
            className={cn(
              colophonPanel,
              "col-span-1 ring-1 ring-cyan-400/15 lg:col-span-1",
            )}
          >
            <h4 className={colophonLabel}>
              <span className="text-cyan-300/90" aria-hidden>
                ▣
              </span>
              {c.docLabel}
            </h4>
            <p className="mb-4 font-mono text-[10px] leading-relaxed text-muted-foreground/90">
              {lang === "es" ? "Especificación, recompensas y API." : "Spec, rewards, and API reference."}
            </p>
            <Link
              href={c.docHref}
              className="group relative inline-flex min-h-[48px] w-full items-center justify-center overflow-hidden border-4 border-double border-cyan-400/55 bg-gradient-to-b from-cyan-500/15 to-cyan-950/40 px-5 py-3.5 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.12)] transition-all duration-300 hover:border-cyan-300 hover:from-cyan-400/25 hover:text-white hover:shadow-[0_0_32px_rgba(34,211,238,0.22)] active:scale-[0.98] sm:w-auto sm:min-w-[10.5rem]"
            >
              <span
                className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background:
                    "linear-gradient(105deg, transparent 0%, rgba(34,211,238,0.08) 45%, rgba(34,211,238,0.15) 50%, rgba(34,211,238,0.08) 55%, transparent 100%)",
                }}
                aria-hidden
              />
              <span className="relative z-[1]">{c.docButton}</span>
            </Link>
          </div>

          <div className={cn(colophonPanel, "col-span-1")}>
            <h4 className={colophonLabel}>
              <span className="text-cyan-300/90" aria-hidden>
                ◈
              </span>
              {c.developerLabel}
            </h4>
            <ul className="flex flex-col gap-2">
              <li>
                <a
                  href="https://github.com/klorenn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-between gap-2 rounded border border-cyan-500/20 bg-black/30 px-3 py-2.5 font-mono text-[11px] text-cyan-100/90 transition-colors hover:border-cyan-400/45 hover:bg-cyan-950/30 hover:text-cyan-50"
                >
                  <span>{c.developerGithubLabel}</span>
                  <span className="text-cyan-500/50" aria-hidden>
                    ↗
                  </span>
                </a>
              </li>
              <li>
                <a
                  href="https://x.com/kl0ren"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-between gap-2 rounded border border-cyan-500/20 bg-black/30 px-3 py-2.5 font-mono text-[11px] text-cyan-100/90 transition-colors hover:border-cyan-400/45 hover:bg-cyan-950/30 hover:text-cyan-50"
                >
                  <span>{c.developerXLabel}</span>
                  <span className="text-cyan-500/50" aria-hidden>
                    ↗
                  </span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div
          ref={footerRef}
          className="mt-16 flex flex-col gap-4 border-t border-cyan-500/10 pt-10 md:mt-20 md:flex-row md:items-center md:justify-between"
        >
          <p className="max-w-prose font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-muted-foreground/90">
            {c.copyright}
          </p>
          <p className="font-mono text-[10px] italic tracking-wide text-cyan-200/55 md:text-right">{c.tagline}</p>
        </div>
      </div>
    </section>
  )
}
