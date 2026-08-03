import { HeroSection } from "@/components/hero-section"
import { SignalsSection } from "@/components/signals-section"
import { WorkSection } from "@/components/work-section"
import { PrinciplesSection } from "@/components/principles-section"
import { ColophonSection } from "@/components/colophon-section"
import { SideNav } from "@/components/side-nav"
import { LandingLangShell } from "@/components/landing-lang-shell"
import { LandingBuildStamp } from "@/components/landing-build-stamp"
import { SystemTicker } from "@/components/system-ticker"
import { FloatingHeader } from "@/components/floating-header"

export default function Page() {
  return (
    <LandingLangShell>
      <main className="relative min-h-screen">
        <SystemTicker />
        <FloatingHeader />
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
