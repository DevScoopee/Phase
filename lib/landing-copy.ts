/** Matches `AppLang` from lang-context (kept here so lib/ does not import components). */
export type LandingLang = "en" | "es"

export type LandingSignal = { date: string; title: string; note: string }

export type LandingWorkModule = {
  title: string
  medium: string
  description: string
  span: string
}

export type LandingPrinciple = {
  number: string
  category: string
  titleParts: { text: string; highlight: boolean }[]
  description: string
  align: "left" | "right"
}

export type LandingColophon = {
  sectionEyebrow: string
  sectionTitle: string
  networkLabel: string
  networkLines: string[]
  standardLabel: string
  standardLines: string[]
  docLabel: string
  docButton: string
  docHref: string
  developerLabel: string
  developerGithubLabel: string
  developerXLabel: string
  copyright: string
  tagline: string
}

export type LandingCopy = {
  studioBrand: string
  sideNav: { id: string; label: string }[]
  signals: {
    sectionEyebrow: string
    sectionTitle: string
    items: LandingSignal[]
  }
  work: {
    sectionEyebrow: string
    sectionTitle: string
    intro: string
    modules: LandingWorkModule[]
  }
  principles: {
    sectionEyebrow: string
    sectionTitle: string
    items: LandingPrinciple[]
  }
  colophon: LandingColophon
}

const landingCopy: Record<LandingLang, LandingCopy> = {
  es: {
    studioBrand: "PHASE Studio",
    sideNav: [
      { id: "hero", label: "Índice" },
      { id: "signals", label: "Registros" },
      { id: "work", label: "Módulos" },
      { id: "principles", label: "Axiomas" },
      { id: "colophon", label: "Documentación" },
    ],
    signals: {
      sectionEyebrow: "01 / Registros del Protocolo (Protocol Logs)",
      sectionTitle: "TRANSICIONES DE ESTADO",
      items: [
        {
          date: "2026.04.03",
          title: "Despliegue x402",
          note: "Lanzamiento oficial del motor de liquidez dual en Soroban Testnet.",
        },
        {
          date: "2026.03.28",
          title: "Integración multimedia",
          note: "Activación de la Suite Multimodal (Paint, Upload, URL) para la creación de arte.",
        },
        {
          date: "2026.03.15",
          title: "NFT Utility SEP-50",
          note: "Implementación de NFTs dinámicos/coleccionables en Soroban con metadatos evolucionables.",
        },
        {
          date: "2026.02.20",
          title: "Sistema de comisiones",
          note: "Activación de la Tesorería del Protocolo (95/5 split) para creadores.",
        },
      ],
    },
    work: {
      sectionEyebrow: "02 / Módulos Principales (Core Modules)",
      sectionTitle: "ARQUITECTURA x402",
      intro:
        "Capas de liquidez, identidad y ejecución en Soroban: diseño del protocolo y la experiencia de creación.",
      modules: [
        {
          title: "Esencia fraccionada",
          medium: "Liquidez",
          description:
            "Opera con activos digitales como tokens estándar. Tu inversión es líquida y negociable en cualquier momento.",
          span: "col-span-1 row-span-1 sm:col-span-2 sm:row-span-2",
        },
        {
          title: "Motor nativo Soroban",
          medium: "Ejecución",
          description:
            "Smart Contracts de alta velocidad con costos de transacción cercanos a cero.",
          span: "col-span-1 row-span-1",
        },
        {
          title: "Identidad soberana",
          medium: "Metadatos",
          description:
            "Tus activos llevan metadatos dinámicos. Tu historial en la cadena evoluciona con cada interacción.",
          span: "col-span-1 row-span-1 sm:row-span-2",
        },
        {
          title: "Fusión de liquidez",
          medium: "Umbral",
          description:
            "Al alcanzar el umbral de fusión, el protocolo sintetiza automáticamente un identificador de estado sólido (NFT).",
          span: "col-span-1 row-span-1",
        },
        {
          title: "Cristalización de activos",
          medium: "Estado",
          description: "Representación gráfica única en la cadena de tu proceso de consolidación de valor.",
          span: "col-span-1 sm:col-span-2 row-span-1",
        },
      ],
    },
    principles: {
      sectionEyebrow: "03 / Axiomas del Protocolo",
      sectionTitle: "AXIOMAS DEL PROTOCOLO",
      items: [
        {
          number: "01",
          category: "LIQUIDEZ",
          titleParts: [
            { text: "ENTRADA ", highlight: false },
            { text: "FRACCIONADA", highlight: true },
          ],
          description:
            "Sin barreras. Usa tokens para comprar, vender o proveer liquidez en DEXs con máxima eficiencia.",
          align: "left",
        },
        {
          number: "02",
          category: "IDENTIDAD",
          titleParts: [
            { text: "TRANSICIÓN ", highlight: false },
            { text: "DE ESTADO", highlight: true },
          ],
          description:
            "La liquidez es el flujo; el artefacto sólido es la permanencia. Fusiona fracciones para estabilizar tu presencia en la red.",
          align: "right",
        },
        {
          number: "03",
          category: "RED",
          titleParts: [
            { text: "SISTEMAS ", highlight: false },
            { text: "SOBRE PANTALLAS", highlight: true },
          ],
          description:
            "Diseñamos comportamientos de red inteligentes. Ejecución instantánea con finalidad garantizada.",
          align: "left",
        },
      ],
    },
    colophon: {
      sectionEyebrow: "04 / Telemetría (System Data)",
      sectionTitle: "DATOS DEL SISTEMA",
      networkLabel: "Red",
      networkLines: ["Stellar // Soroban (Testnet)"],
      standardLabel: "Estándar",
      standardLines: ["x402 Híbrido / NFT Utility SEP-50 (+ SEP-0020 para validadores)"],
      docLabel: "Documentación",
      docButton: "[ DOC ]",
      docHref: "/docs",
      developerLabel: "Desarrollador",
      developerGithubLabel: "GitHub (@klorenn)",
      developerXLabel: "X (@kl0ren)",
      copyright: "© 2026 Phase Protocol. Todos los derechos reservados.",
      tagline: "Diseñado con intención. Compilado con precisión.",
    },
  },
  en: {
    studioBrand: "PHASE Studio",
    sideNav: [
      { id: "hero", label: "Index" },
      { id: "signals", label: "Protocol Logs" },
      { id: "work", label: "Core Modules" },
      { id: "principles", label: "Axioms" },
      { id: "colophon", label: "Documentation" },
    ],
    signals: {
      sectionEyebrow: "01 / Protocol Logs",
      sectionTitle: "STATE TRANSITIONS",
      items: [
        {
          date: "2026.04.03",
          title: "x402 deployment",
          note: "Official launch of the dual-state liquidity engine on Soroban Testnet.",
        },
        {
          date: "2026.03.28",
          title: "Multimedia integration",
          note: "Multimodal Suite (Paint, Upload, URL) activated for art creation.",
        },
        {
          date: "2026.03.15",
          title: "SEP-50 utility NFTs",
          note: "Implementation of dynamic Soroban collectibles with evolvable metadata.",
        },
        {
          date: "2026.02.20",
          title: "Fee system",
          note: "Protocol Treasury activation (95/5 split) for creators.",
        },
      ],
    },
    work: {
      sectionEyebrow: "02 / Core Modules",
      sectionTitle: "x402 ARCHITECTURE",
      intro:
        "Liquidity, identity, and execution on Soroban — protocol design and the creator experience.",
      modules: [
        {
          title: "Fractionalized essence",
          medium: "Liquidity",
          description:
            "Operate with digital assets as standard tokens. Your investment remains liquid and tradable at all times.",
          span: "col-span-1 row-span-1 sm:col-span-2 sm:row-span-2",
        },
        {
          title: "Soroban native engine",
          medium: "Execution",
          description: "High-speed Smart Contract execution with near-zero transaction costs.",
          span: "col-span-1 row-span-1",
        },
        {
          title: "Sovereign identity",
          medium: "Metadata",
          description:
            "Your assets carry dynamic metadata. Your on-chain history evolves with every interaction.",
          span: "col-span-1 row-span-1 sm:row-span-2",
        },
        {
          title: "Liquidity fusion",
          medium: "Threshold",
          description:
            "Once the fusion threshold is met, the protocol automatically synthesizes a solid-state identifier (NFT).",
          span: "col-span-1 row-span-1",
        },
        {
          title: "Asset crystallization",
          medium: "State",
          description: "Unique on-chain graphical representation of your value consolidation process.",
          span: "col-span-1 sm:col-span-2 row-span-1",
        },
      ],
    },
    principles: {
      sectionEyebrow: "03 / Axioms",
      sectionTitle: "PROTOCOL AXIOMS",
      items: [
        {
          number: "01",
          category: "LIQUIDITY",
          titleParts: [
            { text: "FRACTIONAL ", highlight: false },
            { text: "ENTRY", highlight: true },
          ],
          description:
            "Zero friction. Use tokens to buy, sell, or provide liquidity in DEXs with maximum efficiency.",
          align: "left",
        },
        {
          number: "02",
          category: "IDENTITY",
          titleParts: [
            { text: "STATE ", highlight: false },
            { text: "TRANSITION", highlight: true },
          ],
          description:
            "Liquidity is the flow; the solid artifact is the permanence. Fuse fractions to stabilize your network presence.",
          align: "right",
        },
        {
          number: "03",
          category: "NETWORK",
          titleParts: [
            { text: "SYSTEMS ", highlight: false },
            { text: "OVER SCREENS", highlight: true },
          ],
          description:
            "We design intelligent network behaviors. Instant execution with guaranteed finality.",
          align: "left",
        },
      ],
    },
    colophon: {
      sectionEyebrow: "04 / Telemetry (System Data)",
      sectionTitle: "SYSTEM DATA",
      networkLabel: "Network",
      networkLines: ["Stellar // Soroban (Testnet)"],
      standardLabel: "Standard",
      standardLines: ["x402 Hybrid / SEP-50 utility NFTs (+ SEP-0020 for validators)"],
      docLabel: "Documentation",
      docButton: "[ DOC ]",
      docHref: "/docs",
      developerLabel: "Developer",
      developerGithubLabel: "GitHub (@klorenn)",
      developerXLabel: "X (@kl0ren)",
      copyright: "© 2026 Phase Protocol. All rights reserved.",
      tagline: "Designed with intention. Compiled with precision.",
    },
  },
}

export function pickLandingCopy(lang: LandingLang): LandingCopy {
  return landingCopy[lang]
}
