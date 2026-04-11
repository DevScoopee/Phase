"use client"

import Link from "next/link"
import { LangToggle } from "@/components/lang-toggle"
import { useLang } from "@/components/lang-context"
import { pickProjectDocs, type DocsLinkItem } from "@/lib/project-docs-content"

function DocsHref({ item }: { item: DocsLinkItem }) {
  const isInternal = item.href.startsWith("/")
  const className =
    "font-semibold text-cyan-300 underline decoration-cyan-500/40 underline-offset-4 transition-colors hover:text-cyan-100 hover:decoration-cyan-300 break-words"
  const label = (
    <>
      {item.label}
      {!isInternal ? (
        <span className="ml-1 text-[10px] font-normal text-cyan-500/60" aria-hidden>
          ↗
        </span>
      ) : null}
    </>
  )
  return (
    <div className="rounded-lg border border-cyan-500/20 bg-black/30 p-4 transition-colors hover:border-cyan-400/35">
      {isInternal ? (
        <Link href={item.href} className={className}>
          {label}
        </Link>
      ) : (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
          {label}
        </a>
      )}
      {item.description ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
      ) : null}
    </div>
  )
}

export default function DocsPage() {
  const { lang } = useLang()
  const d = pickProjectDocs(lang)

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <div className="border-b border-cyan-500/20 bg-black/40 px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground transition-colors hover:text-cyan-300"
          >
            ← HOME
          </Link>
          <LangToggle />
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-10 pb-20 md:px-8">
        <h1 className="font-[var(--font-bebas)] text-4xl tracking-tight text-foreground md:text-5xl">{d.pageTitle}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{d.pageSubtitle}</p>

        <nav
          aria-label={d.tocLabel}
          className="mt-10 rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-5 shadow-[inset_0_1px_0_rgba(34,211,238,0.08)]"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-400/90">{d.tocLabel}</p>
          <ol className="mt-4 space-y-2 text-sm">
            {d.sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-cyan-200/90 underline-offset-4 transition-colors hover:text-cyan-100 hover:underline"
                >
                  <span className="text-cyan-600/60">{String(i + 1).padStart(2, "0")}.</span> {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-14 space-y-16">
          {d.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="border-b border-cyan-500/25 pb-3 text-lg font-bold uppercase tracking-[0.18em] text-cyan-100">
                {section.title}
              </h2>
              <div className="mt-5 space-y-5 text-sm leading-relaxed text-foreground/88">
                {section.blocks.map((block, idx) => {
                  if (block.type === "p") {
                    return (
                      <p key={idx} className="text-pretty">
                        {block.text}
                      </p>
                    )
                  }
                  if (block.type === "links") {
                    return (
                      <div key={idx} className="space-y-3">
                        {block.intro ? (
                          <p className="text-pretty text-muted-foreground">{block.intro}</p>
                        ) : null}
                        <ul className="list-none space-y-3">
                          {block.items.map((item) => (
                            <li key={`${item.href}-${item.label}`}>
                              <DocsHref item={item} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  }
                  if (block.type === "table") {
                    return (
                      <div key={idx} className="overflow-x-auto rounded-lg border border-cyan-500/20 bg-black/30">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-cyan-500/25 bg-cyan-950/30">
                              {block.headers.map((h) => (
                                <th key={h} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400/90 whitespace-nowrap">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.rows.map((row, ri) => (
                              <tr key={ri} className="border-b border-cyan-500/10 transition-colors hover:bg-cyan-950/10">
                                {row.map((cell, ci) => (
                                  <td key={ci} className="px-4 py-2 font-mono text-[11px] text-foreground/85 align-top">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  }
                  if (block.type === "code") {
                    return (
                      <div key={idx}>
                        {block.label ? (
                          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.28em] text-cyan-500/70">
                            {block.label}
                          </p>
                        ) : null}
                        <pre className="overflow-x-auto rounded-lg border border-cyan-500/20 bg-black/60 p-4 text-[10px] leading-relaxed text-cyan-200/85 shadow-[inset_0_1px_0_rgba(34,211,238,0.06)]">
                          {block.text}
                        </pre>
                      </div>
                    )
                  }
                  return (
                    <ul key={idx} className="list-none space-y-3 border-l-2 border-cyan-500/30 pl-4">
                      {block.items.map((item) => (
                        <li key={item} className="flex gap-2.5 text-pretty">
                          <span className="shrink-0 text-cyan-500/70" aria-hidden>
                            ▹
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-16 border-t border-cyan-500/15 pt-8 text-[10px] uppercase tracking-widest text-muted-foreground">
          PHASE · {lang === "es" ? "Documentación integrada en la aplicación." : "Documentation lives inside the app."}
        </p>
      </main>
    </div>
  )
}
