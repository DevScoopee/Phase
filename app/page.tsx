import { HeroSection } from "@/components/hero-section"
import { SignalsSection } from "@/components/signals-section"
import { WorkSection } from "@/components/work-section"
import { PrinciplesSection } from "@/components/principles-section"
import { ColophonSection } from "@/components/colophon-section"
import { SideNav } from "@/components/side-nav"
import { FreighterConnect } from "@/components/freighter-connect"
import { LangToggle } from "@/components/lang-toggle"
import { LandingLangShell } from "@/components/landing-lang-shell"
import { LandingBuildStamp } from "@/components/landing-build-stamp"

export default function Page() {
  return (
    <LandingLangShell>
      <main className="relative min-h-screen">
        <div
          className="pointer-events-none fixed inset-0 z-[5] bg-gradient-to-b from-[oklch(0.09_0.014_220)] via-transparent to-[oklch(0.09_0.014_220)] opacity-80"
          aria-hidden="true"
        />
        <div className="fixed top-4 right-4 z-50 max-w-[calc(100vw-1.5rem)] md:top-6 md:right-6 md:max-w-none pointer-events-none">
          <FreighterConnect trailing={<LangToggle />} />
        </div>
        <SideNav />
        <div className="grid-bg fixed inset-0 z-0" aria-hidden="true" />
        <div className="hero-spotlight" aria-hidden="true" />
        <LandingBuildStamp />

        <div className="relative z-10 section-shell">
          <HeroSection />
          <SignalsSection />
          <WorkSection />
          <PrinciplesSection />
          <ColophonSection />
        </div>
      </main>
    </LandingLangShell>
  )
}
