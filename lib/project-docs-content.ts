/** Contenido de documentación del proyecto (no enlazado a archivos .md externos). */
import type { LandingLang } from "@/lib/landing-copy"

export type DocsLinkItem = {
  label: string
  href: string
  description?: string
}

export type DocsBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  /** Lista de hipervínculos (internos si href empieza por /, externos en nueva pestaña). */
  | { type: "links"; intro?: string; items: DocsLinkItem[] }

export type DocsSection = {
  id: string
  title: string
  blocks: DocsBlock[]
}

export type ProjectDocsPage = {
  pageTitle: string
  pageSubtitle: string
  tocLabel: string
  sections: DocsSection[]
}

const projectDocs: Record<LandingLang, ProjectDocsPage> = {
  es: {
    pageTitle: "Documentación PHASE",
    pageSubtitle:
      "PHASE es una aplicación web para crear colecciones on-chain, listarlas en un mercado y acuñar NFTs de utilidad en Soroban testnet, pagando con PHASER_LIQ. Aquí tienes el mapa del producto, el stack y enlaces oficiales.",
    tocLabel: "Índice",
    sections: [
      {
        id: "overview",
        title: "Qué es el proyecto",
        blocks: [
          {
            type: "p",
            text: "PHASE conecta tres piezas: una landing de presentación, un mercado donde se ven colecciones creadas por la comunidad, una forja donde el creador registra nombre, precio en PHASER_LIQ e imagen del artefacto, y una cámara de fusión donde el usuario conecta Freighter, paga el precio de la colección y el contrato Soroban actualiza el estado y puede acuñar un NFT de utilidad tipo SEP-50 asociado a esa fase.",
          },
          {
            type: "p",
            text: "El flujo de pago en la UI sigue una narrativa tipo “settlement / x402”: primero aseguras liquidez en PHASER_LIQ (balance on-chain), luego firmas la transacción que el protocolo construye. Todo corre sobre red de prueba; no es asesoría financiera ni producto de inversión.",
          },
          {
            type: "p",
            text: "Estado actual x402 en este repo: `app/api/x402` opera como endpoint compatible de demostración (challenge 402 + verificador local). Para producción, se recomienda conectar un facilitator x402 real según la guía oficial.",
          },
          {
            type: "p",
            text: "Rutas principales de esta app:",
          },
          {
            type: "links",
            items: [
              {
                label: "Inicio (landing)",
                href: "/",
                description: "Hero, señales del protocolo, módulos y acceso a conectar wallet.",
              },
              {
                label: "Mercado",
                href: "/dashboard",
                description: "Catálogo de colecciones, precios en PHASER_LIQ y acceso a la cámara por colección.",
              },
              {
                label: "Forja",
                href: "/forge",
                description: "Crear colección: nombre, precio, imagen (URL, archivo o lienzo) y despliegue vía wallet.",
              },
              {
                label: "Cámara de fusión",
                href: "/chamber",
                description: "Monitor de wallet, precio de mint, settlement y visualización del artefacto / estado de fase.",
              },
              {
                label: "Documentación",
                href: "/docs",
                description: "Esta página.",
              },
            ],
          },
        ],
      },
      {
        id: "concepts",
        title: "Conceptos y piezas",
        blocks: [
          {
            type: "ul",
            items: [
              "Colección: registro on-chain con nombre, treasury/creador, precio de mint en PHASER_LIQ y URI de imagen para metadatos.",
              "Pool protocolo (colección 0): mint base del ecosistema; otras colecciones son creadas desde la Forja.",
              "PHASER_LIQ: token de liquidez en testnet usado para mostrar precios y ejecutar pagos en el contrato.",
              "Artefacto / NFT de utilidad: tras el settlement, el contrato puede reflejar estado sólido y metadatos enlazados (https o ipfs://).",
              "API x402 del proyecto: `/api/x402` (challenge), `/api/x402/supported`, `/api/x402/verify`, `/api/x402/settle` para compatibilidad y pruebas locales.",
            ],
          },
        ],
      },
      {
        id: "stack",
        title: "Stack técnico",
        blocks: [
          {
            type: "ul",
            items: [
              "Frontend: Next.js (App Router), React, Tailwind; UI táctica en Forja/Cámara/Mercado.",
              "Contrato: PHASE Protocol desplegado en Soroban (testnet); direcciones y passphrase vienen de variables de entorno.",
              "Wallet: extensión Freighter para firmar; la app usa la API oficial de Freighter.",
              "IPFS (opcional): subida de imágenes vía API del servidor si está configurado (p. ej. Pinata).",
            ],
          },
          {
            type: "p",
            text: "Referencias del ecosistema Stellar (abren en nueva pestaña):",
          },
          {
            type: "links",
            items: [
              {
                label: "Stellar — Documentación para desarrolladores",
                href: "https://developers.stellar.org/",
                description: "Hub principal: redes, transacciones, Horizon y herramientas.",
              },
              {
                label: "Soroban — Smart contracts",
                href: "https://developers.stellar.org/docs/build/smart-contracts",
                description: "Contratos inteligentes en Stellar: Rust, WASM, entorno de pruebas.",
              },
              {
                label: "Stellar Asset Contract (tokens)",
                href: "https://developers.stellar.org/docs/tokens/stellar-asset-contract",
                description: "Cómo Stellar modela activos y tokens en Soroban.",
              },
              {
                label: "Freighter — Guía para desarrolladores",
                href: "https://developers.stellar.org/docs/tools/developer-tools/freighter-wallet",
                description: "Integración de la wallet en aplicaciones web.",
              },
              {
                label: "Freighter (sitio del producto)",
                href: "https://www.freighter.app/",
                description: "Instalación de la extensión.",
              },
            ],
          },
        ],
      },
      {
        id: "flows",
        title: "Flujos paso a paso",
        blocks: [
          {
            type: "p",
            text: "Creador: instala Freighter → abre Forja → conecta wallet → define colección y arte → despliega. Obtendrás un ID de colección; comparte /chamber?collection=ID para que otros minten ahí.",
          },
          {
            type: "p",
            text: "Participante: entra al Mercado o usa el enlace → abre la Cámara con la colección correcta → conecta la misma red (testnet) → revisa saldo PHASER_LIQ; si hay faucet/recompensas en la UI, úsalos según las reglas mostradas → pulsa la acción de settlement cuando el saldo cubra el precio.",
          },
          {
            type: "links",
            intro: "Accesos directos:",
            items: [
              { label: "Abrir Forja", href: "/forge" },
              { label: "Abrir Mercado", href: "/dashboard" },
              { label: "Abrir Cámara (pool por defecto)", href: "/chamber" },
            ],
          },
        ],
      },
      {
        id: "token",
        title: "PHASER_LIQ y exploradores",
        blocks: [
          {
            type: "p",
            text: "Los importes en pantalla se expresan en PHASER_LIQ; la conversión a stroops y las llamadas al contrato token las hace el cliente. En la Cámara, el monitor de estado suele incluir un enlace al contrato del token en Stellar Expert cuando la app está configurada.",
          },
          {
            type: "links",
            intro: "Explorar la red de prueba:",
            items: [
              {
                label: "Stellar Expert — Testnet",
                href: "https://stellar.expert/explorer/testnet",
                description: "Busca contratos, cuentas y transacciones en testnet.",
              },
            ],
          },
        ],
      },
      {
        id: "trust",
        title: "Previews y confianza",
        blocks: [
          {
            type: "p",
            text: "Las miniaturas del mercado y los textos son orientativos. Lo que importa es el estado devuelto por el contrato y lo que ves en la Cámara con tu dirección conectada (balance, fase, titularidad cuando la UI lo verifica).",
          },
        ],
      },
      {
        id: "links",
        title: "Más enlaces y lecturas",
        blocks: [
          {
            type: "p",
            text: "Enlaces útiles fuera de esta app (documentación oficial, explorador y estándares). Todos abren en una pestaña nueva.",
          },
          {
            type: "links",
            items: [
              {
                label: "developers.stellar.org",
                href: "https://developers.stellar.org/",
                description: "Documentación oficial de Stellar para desarrolladores.",
              },
              {
                label: "Soroban — Introducción a smart contracts",
                href: "https://developers.stellar.org/docs/build/smart-contracts/getting-started",
                description: "Primeros pasos con contratos en la red Stellar.",
              },
              {
                label: "Stellar Expert (testnet)",
                href: "https://stellar.expert/explorer/testnet",
                description: "Explorador de bloques y contratos; aquí suelen apuntar los enlaces TOKEN_EXPERT de la Cámara.",
              },
              {
                label: "x402 en Stellar (docs oficiales)",
                href: "https://developers.stellar.org/docs/build/agentic-payments/x402",
                description:
                  "Guía oficial de flujo x402 en Stellar, wallets compatibles y facilitators (`/verify`, `/settle`, `/supported`).",
              },
              {
                label: "x402-stellar (npm)",
                href: "https://www.npmjs.com/package/x402-stellar",
                description: "Paquete oficial para construir/integrar flujos x402 en apps y servicios sobre Stellar.",
              },
              {
                label: "Declare your node (Tier 1 / SEP-0020 validator declaration)",
                href: "https://developers.stellar.org/docs/validators/tier-1-orgs#declare-your-node",
                description:
                  "Contexto de auto-declaración de nodos validadores y publicación de metadata en `stellar.toml`.",
              },
              {
                label: "SEP-0020 (self-verification de nodos validadores)",
                href: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0020.md",
                description:
                  "Especificación activa para vincular identidad de operadores y metadata de validadores vía cuentas Stellar + `stellar.toml`.",
              },
              {
                label: "SEP-0050 (NFT / collectibles en Soroban)",
                href: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0050.md",
                description: "Borrador del estándar de coleccionables/NFT en Stellar Soroban.",
              },
              {
                label: "IPFS",
                href: "https://ipfs.tech/",
                description: "Contexto sobre ipfs:// cuando la forja o los metadatos usan gateways IPFS.",
              },
            ],
          },
        ],
      },
    ],
  },
  en: {
    pageTitle: "PHASE Documentation",
    pageSubtitle:
      "PHASE is a web app to deploy on-chain collections, browse them in a market, and mint utility NFTs on Soroban testnet using PHASER_LIQ. Below: product map, stack, and official links.",
    tocLabel: "Contents",
    sections: [
      {
        id: "overview",
        title: "What this project is",
        blocks: [
          {
            type: "p",
            text: "PHASE ties together a marketing landing, a market for community collections, a forge where creators set name, PHASER_LIQ price, and artwork, and a fusion chamber where users connect Freighter, pay the collection price, and the Soroban contract updates phase state and can mint a SEP-50-style utility NFT tied to that phase.",
          },
          {
            type: "p",
            text: "The payment UX follows a settlement-style flow: you hold PHASER_LIQ on-chain, then sign the transaction the protocol builds. Everything runs on testnet—this is not financial advice or an investment product.",
          },
          {
            type: "p",
            text: "Current x402 status in this repository: `app/api/x402` is a compatibility/demo endpoint (402 challenge + local verifier). For production use, connect a real x402 facilitator as documented in the official guide.",
          },
          {
            type: "p",
            text: "Main routes in this app:",
          },
          {
            type: "links",
            items: [
              {
                label: "Home (landing)",
                href: "/",
                description: "Hero, protocol signals, modules, and wallet connect entry points.",
              },
              {
                label: "Market",
                href: "/dashboard",
                description: "Collection catalog, PHASER_LIQ prices, and links into the chamber per collection.",
              },
              {
                label: "Forge",
                href: "/forge",
                description: "Create a collection: name, price, image (URL, file, or canvas) and deploy via wallet.",
              },
              {
                label: "Fusion chamber",
                href: "/chamber",
                description: "Wallet monitor, mint price, settlement, and artifact / phase visualization.",
              },
              {
                label: "Documentation",
                href: "/docs",
                description: "This page.",
              },
            ],
          },
        ],
      },
      {
        id: "concepts",
        title: "Concepts and moving parts",
        blocks: [
          {
            type: "ul",
            items: [
              "Collection: on-chain record with name, creator/treasury, PHASER_LIQ mint price, and image URI for metadata.",
              "Protocol pool (collection 0): baseline mint path; other collections are created from the Forge.",
              "PHASER_LIQ: testnet liquidity token used for quoted prices and contract payments.",
              "Artifact / utility NFT: after settlement, the contract can reflect solid state and metadata (https or ipfs://).",
              "Project x402 API: `/api/x402` (challenge), `/api/x402/supported`, `/api/x402/verify`, `/api/x402/settle` for local compatibility/testing.",
            ],
          },
        ],
      },
      {
        id: "stack",
        title: "Technical stack",
        blocks: [
          {
            type: "ul",
            items: [
              "Frontend: Next.js (App Router), React, Tailwind; tactical UI on Forge/Chamber/Market.",
              "Contract: PHASE Protocol on Soroban testnet; contract IDs and passphrase come from environment variables.",
              "Wallet: Freighter browser extension for signing; the app uses the official Freighter API.",
              "IPFS (optional): server-side upload when configured (e.g. Pinata JWT).",
            ],
          },
          {
            type: "p",
            text: "Stellar ecosystem references (open in a new tab):",
          },
          {
            type: "links",
            items: [
              {
                label: "Stellar — Developer documentation",
                href: "https://developers.stellar.org/",
                description: "Main hub: networks, transactions, Horizon, and tooling.",
              },
              {
                label: "Soroban — Smart contracts",
                href: "https://developers.stellar.org/docs/build/smart-contracts",
                description: "Smart contracts on Stellar: Rust, WASM, testing workflow.",
              },
              {
                label: "Stellar Asset Contract (tokens)",
                href: "https://developers.stellar.org/docs/tokens/stellar-asset-contract",
                description: "How Stellar represents assets and tokens on Soroban.",
              },
              {
                label: "Freighter — Developer guide",
                href: "https://developers.stellar.org/docs/tools/developer-tools/freighter-wallet",
                description: "Embedding Freighter in web apps.",
              },
              {
                label: "Freighter (product site)",
                href: "https://www.freighter.app/",
                description: "Install the extension.",
              },
            ],
          },
        ],
      },
      {
        id: "flows",
        title: "Step-by-step flows",
        blocks: [
          {
            type: "p",
            text: "Creator: install Freighter → open Forge → connect wallet → define collection and art → deploy. You get a collection ID; share /chamber?collection=ID so others mint there.",
          },
          {
            type: "p",
            text: "Participant: open Market or follow a link → Chamber with the right collection → connect on the same network (testnet) → check PHASER_LIQ balance; use faucet/rewards in the UI if shown → run settlement when balance covers the price.",
          },
          {
            type: "links",
            intro: "Quick links:",
            items: [
              { label: "Open Forge", href: "/forge" },
              { label: "Open Market", href: "/dashboard" },
              { label: "Open Chamber (default pool)", href: "/chamber" },
            ],
          },
        ],
      },
      {
        id: "token",
        title: "PHASER_LIQ and explorers",
        blocks: [
          {
            type: "p",
            text: "Amounts are shown in PHASER_LIQ; the client converts to stroops and talks to the token contract. In the Chamber, the status monitor often links the token contract on Stellar Expert when the app is configured.",
          },
          {
            type: "links",
            intro: "Browse testnet data:",
            items: [
              {
                label: "Stellar Expert — Testnet",
                href: "https://stellar.expert/explorer/testnet",
                description: "Search contracts, accounts, and transactions on testnet.",
              },
            ],
          },
        ],
      },
      {
        id: "trust",
        title: "Previews and trust",
        blocks: [
          {
            type: "p",
            text: "Market thumbnails and copy are informational. The source of truth is contract state and what you see in the Chamber with your connected address (balance, phase, ownership checks when the UI shows them).",
          },
        ],
      },
      {
        id: "links",
        title: "More links and reading",
        blocks: [
          {
            type: "p",
            text: "Hand-picked external documentation, explorer, and standards. All open in a new tab.",
          },
          {
            type: "links",
            items: [
              {
                label: "developers.stellar.org",
                href: "https://developers.stellar.org/",
                description: "Official Stellar developer documentation.",
              },
              {
                label: "Soroban — Smart contracts getting started",
                href: "https://developers.stellar.org/docs/build/smart-contracts/getting-started",
                description: "First steps writing contracts on Stellar.",
              },
              {
                label: "Stellar Expert (testnet)",
                href: "https://stellar.expert/explorer/testnet",
                description: "Block explorer; Chamber TOKEN_EXPERT links usually point here.",
              },
              {
                label: "x402 on Stellar (official docs)",
                href: "https://developers.stellar.org/docs/build/agentic-payments/x402",
                description:
                  "Canonical x402 guide for Stellar: compatible wallets, facilitator options, and integration references.",
              },
              {
                label: "x402-stellar (npm)",
                href: "https://www.npmjs.com/package/x402-stellar",
                description: "Official package to integrate x402 payment flows on Stellar-enabled apps and APIs.",
              },
              {
                label: "Declare your node (Tier 1 / SEP-0020 validator declaration)",
                href: "https://developers.stellar.org/docs/validators/tier-1-orgs#declare-your-node",
                description:
                  "Validator declaration context and why `stellar.toml` metadata matters for discoverability.",
              },
              {
                label: "SEP-0020 (validator self-verification)",
                href: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0020.md",
                description:
                  "Active SEP for linking validator operator identity and metadata via Stellar accounts and `stellar.toml`.",
              },
              {
                label: "SEP-0050 (NFT / collectibles on Soroban)",
                href: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0050.md",
                description: "Draft proposal for NFT/collectible interfaces in Stellar Soroban.",
              },
              {
                label: "IPFS",
                href: "https://ipfs.tech/",
                description: "Background on ipfs:// when forge or metadata uses IPFS gateways.",
              },
            ],
          },
        ],
      },
    ],
  },
}

export function pickProjectDocs(lang: LandingLang): ProjectDocsPage {
  return projectDocs[lang]
}
