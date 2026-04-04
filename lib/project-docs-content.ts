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
      "PHASE (P H A S E   P R O T O C O L) es una app web cyber-brutalista para crear colecciones on-chain, mercado, forja y cámara de fusión en Soroban testnet con PHASERLIQ y flujos x402. Incluye activos de marca, contratos de referencia y flujos detallados.",
    tocLabel: "Índice",
    sections: [
      {
        id: "overview",
        title: "Qué es el proyecto",
        blocks: [
          {
            type: "p",
            text: "PHASE conecta tres piezas: una landing de presentación, un mercado donde se ven colecciones creadas por la comunidad, una forja donde el creador registra nombre, precio en PHASERLIQ e imagen del artefacto, y una cámara de fusión donde el usuario conecta Freighter, paga el precio de la colección y el contrato Soroban actualiza el estado y puede acuñar un NFT de utilidad tipo SEP-20 asociado a esa fase.",
          },
          {
            type: "p",
            text: "El flujo de pago en la UI sigue una narrativa tipo “settlement / x402”: primero aseguras liquidez en PHASERLIQ (balance on-chain), luego firmas la transacción que el protocolo construye. Todo corre sobre red de prueba; no es asesoría financiera ni producto de inversión.",
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
                description: "Catálogo de colecciones, precios en PHASERLIQ y acceso a la cámara por colección.",
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
        id: "brand-assets",
        title: "Activos de marca y archivos estáticos",
        blocks: [
          {
            type: "p",
            text: "Los archivos viven en la carpeta public/ del repo y se sirven desde la raíz del sitio. En producción, las URLs absolutas para redes sociales usan metadataBase y NEXT_PUBLIC_SITE_URL en app/layout.tsx (Open Graph y Twitter).",
          },
          {
            type: "links",
            intro: "Rutas públicas (sustituye el origen por tu dominio desplegado, p. ej. https://tu-dominio.com):",
            items: [
              {
                label: "/og-phase.png",
                href: "/og-phase.png",
                description:
                  "Imagen OG / Twitter Card (preview al compartir). Alt sugerido: figura PHASE / energía líquida en Stellar.",
              },
              {
                label: "/icon-sphere.png",
                href: "/icon-sphere.png",
                description: "Favicon y Apple touch icon — esfera reactor / artefacto (alto contraste).",
              },
              {
                label: "/phaser-liq-token.png",
                href: "/phaser-liq-token.png",
                description: "Icono del token PHASERLIQ en la UI y en `stellar.toml` (bloque CURRENCIES) para exploradores.",
              },
              {
                label: "/.well-known/stellar.toml",
                href: "/.well-known/stellar.toml",
                description: "Metadatos SEP-0001 del proyecto; también se genera una ruta dinámica en la app cuando aplica.",
              },
            ],
          },
        ],
      },
      {
        id: "on-chain-contracts",
        title: "Contratos on-chain (testnet)",
        blocks: [
          {
            type: "p",
            text: "Red: Soroban testnet. Passphrase: Test SDF Network ; September 2015. RPC Soroban: https://soroban-testnet.stellar.org. Horizon: https://horizon-testnet.stellar.org. Los IDs por defecto están en lib/phase-protocol.ts; puedes sobrescribirlos con NEXT_PUBLIC_PHASE_PROTOCOL_ID, NEXT_PUBLIC_TOKEN_CONTRACT_ID (y equivalentes sin prefijo para servidor).",
          },
          {
            type: "ul",
            items: [
              "PHASE Protocol (núcleo): colecciones, initiate_phase, NFT de utilidad alineado a SEP-20 en metadatos, settlement x402 en cadena según despliegue.",
              "PHASERLIQ (token Soroban): liquidez de prueba, 7 decimales, nombre típico «Phase Liquidity Token», símbolo PHASERLIQ; usado para precios de mint y transferencias en el flujo de fase.",
            ],
          },
          {
            type: "links",
            intro: "Explorador Stellar Expert (testnet) — referencia por defecto del repo:",
            items: [
              {
                label: "Contrato PHASE Protocol",
                href: "https://stellar.expert/explorer/testnet/contract/CDXZ2HWPSAU3DKACNGTTY3WM6FKN5LPNGMAYFW4KBF74P42RK6SFDRGP",
                description: "ID por defecto CDXZ2…FDRGP (ver env si redesplegaste).",
              },
              {
                label: "Contrato token PHASERLIQ",
                href: "https://stellar.expert/explorer/testnet/contract/CDOAXHWC6YJB7U3ELV67HKJY6HEMJFBNRGJK6WZGUAELBWP3WP77RLFD",
                description: "ID por defecto CDOAX…RLFD — SAC testnet (ver env si usas otro token).",
              },
            ],
          },
        ],
      },
      {
        id: "architecture",
        title: "Cómo funciona (detallado)",
        blocks: [
          {
            type: "p",
            text: "Forja (/forge): el creador conecta Freighter, define nombre de colección, precio en PHASERLIQ y una imagen (URL https o ipfs, archivo con sellado PHASE, o lienzo del estudio). La app construye y firma create_collection; obtienes un collection_id para compartir.",
          },
          {
            type: "p",
            text: "Mercado (/dashboard): lee metadatos y precios desde el contrato o la API de la app; cada tarjeta enlaza a /chamber?collection=ID. La colección 0 es el pool por defecto del protocolo.",
          },
          {
            type: "p",
            text: "Cámara (/chamber): monitor de wallet, saldo PHASERLIQ, precio x402 de la colección y estado de fase (has_phased, NFT utilitario). El usuario puede solicitar genesis supply si la política del contrato lo permite, ejecutar settlement (flujo x402 + transacción Soroban) y ver el artefacto con verificación de titularidad cuando la UI lo resuelve on-chain.",
          },
          {
            type: "p",
            text: "API x402 (demo / compatibilidad): rutas bajo app/api/x402 — challenge 402, supported, verify, settle. Sirven para pruebas locales y alineación con la guía de Agentic Payments; en producción conviene un facilitator x402 real.",
          },
          {
            type: "p",
            text: "Recompensas testnet: GET/POST /api/faucet — genesis, recarga diaria y misiones; requiere ADMIN_SECRET_KEY en servidor para firmar mints. Documentación operativa: docs/PHASER_LIQ_REWARDS_TERMINAL_DOC.md.",
          },
          {
            type: "p",
            text: "Asset clásico (opcional): variables CLASSIC_LIQ_* y NEXT_PUBLIC_CLASSIC_* permiten mostrar PHASERLIQ como asset clásico en Freighter (trustline / bootstrap) además del contrato Soroban.",
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
              "Colección: registro on-chain con nombre, treasury/creador, precio de mint en PHASERLIQ y URI de imagen para metadatos.",
              "Pool protocolo (colección 0): mint base del ecosistema; otras colecciones son creadas desde la Forja.",
              "PHASERLIQ: token de liquidez en testnet usado para mostrar precios y ejecutar pagos en el contrato.",
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
              "Subida de imagen por servidor (opcional): si está activa, Paint/Subir en Forja puede publicar el archivo sellado.",
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
            text: "Participante: entra al Mercado o usa el enlace → abre la Cámara con la colección correcta → conecta la misma red (testnet) → revisa saldo PHASERLIQ; si hay faucet/recompensas en la UI, úsalos según las reglas mostradas → pulsa la acción de settlement cuando el saldo cubra el precio.",
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
        title: "PHASERLIQ y exploradores",
        blocks: [
          {
            type: "p",
            text: "Los importes en pantalla se expresan en PHASERLIQ; la conversión a stroops y las llamadas al contrato token las hace el cliente. Símbolo PHASERLIQ, 7 decimales, nombre on-chain habitual «Phase Liquidity Token». En la Cámara, TOKEN_EXPERT enlaza al contrato del token en Stellar Expert.",
          },
          {
            type: "links",
            intro: "Contratos de referencia (testnet) y explorador:",
            items: [
              {
                label: "Token PHASERLIQ (contrato)",
                href: "https://stellar.expert/explorer/testnet/contract/CDOAXHWC6YJB7U3ELV67HKJY6HEMJFBNRGJK6WZGUAELBWP3WP77RLFD",
                description: "ID por defecto del repo; comprobar env si cambiaste TOKEN_CONTRACT_ID.",
              },
              {
                label: "PHASE Protocol (contrato)",
                href: "https://stellar.expert/explorer/testnet/contract/CDXZ2HWPSAU3DKACNGTTY3WM6FKN5LPNGMAYFW4KBF74P42RK6SFDRGP",
                description: "Núcleo del protocolo; comprobar env si redesplegaste.",
              },
              {
                label: "Stellar Expert — Testnet",
                href: "https://stellar.expert/explorer/testnet",
                description: "Busca cuentas, contratos y transacciones.",
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
      "PHASE (P H A S E   P R O T O C O L) is a cyber-brutalist web app for on-chain collections, market, forge, and fusion chamber on Soroban testnet with PHASERLIQ and x402-style settlement. Covers brand assets, default contracts, and detailed flows.",
    tocLabel: "Contents",
    sections: [
      {
        id: "overview",
        title: "What this project is",
        blocks: [
          {
            type: "p",
            text: "PHASE ties together a marketing landing, a market for community collections, a forge where creators set name, PHASERLIQ price, and artwork, and a fusion chamber where users connect Freighter, pay the collection price, and the Soroban contract updates phase state and can mint a SEP-20-style utility NFT tied to that phase.",
          },
          {
            type: "p",
            text: "The payment UX follows a settlement-style flow: you hold PHASERLIQ on-chain, then sign the transaction the protocol builds. Everything runs on testnet—this is not financial advice or an investment product.",
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
                description: "Collection catalog, PHASERLIQ prices, and links into the chamber per collection.",
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
        id: "brand-assets",
        title: "Brand assets and static files",
        blocks: [
          {
            type: "p",
            text: "Files live under the public/ folder in the repo and are served from the site root. In production, social previews resolve absolute URLs via metadataBase and NEXT_PUBLIC_SITE_URL in app/layout.tsx (Open Graph and Twitter).",
          },
          {
            type: "links",
            intro: "Public paths (replace origin with your deployed domain, e.g. https://your-domain.com):",
            items: [
              {
                label: "/og-phase.png",
                href: "/og-phase.png",
                description: "Open Graph / Twitter Card image. Suggested alt: PHASE hooded figure / liquid energy on Stellar.",
              },
              {
                label: "/icon-sphere.png",
                href: "/icon-sphere.png",
                description: "Favicon and Apple touch icon — stippled reactor / artifact sphere.",
              },
              {
                label: "/phaser-liq-token.png",
                href: "/phaser-liq-token.png",
                description: "PHASERLIQ token icon in the UI and in `stellar.toml` (CURRENCIES) for explorers.",
              },
              {
                label: "/.well-known/stellar.toml",
                href: "/.well-known/stellar.toml",
                description: "SEP-0001 project metadata; a dynamic route may also serve stellar.toml when configured.",
              },
            ],
          },
        ],
      },
      {
        id: "on-chain-contracts",
        title: "On-chain contracts (testnet)",
        blocks: [
          {
            type: "p",
            text: "Network: Soroban testnet. Passphrase: Test SDF Network ; September 2015. Soroban RPC: https://soroban-testnet.stellar.org. Horizon: https://horizon-testnet.stellar.org. Default IDs are defined in lib/phase-protocol.ts; override with NEXT_PUBLIC_PHASE_PROTOCOL_ID, NEXT_PUBLIC_TOKEN_CONTRACT_ID (and server-side equivalents without the prefix).",
          },
          {
            type: "ul",
            items: [
              "PHASE Protocol (core): collections, initiate_phase, SEP-20-aligned utility NFT metadata, on-chain x402 settlement per deployment.",
              "PHASERLIQ (Soroban token): testnet liquidity token, 7 decimals, typically named “Phase Liquidity Token”, symbol PHASERLIQ; used for mint pricing and phase transfers.",
            ],
          },
          {
            type: "links",
            intro: "Stellar Expert (testnet) — default repository reference IDs:",
            items: [
              {
                label: "PHASE Protocol contract",
                href: "https://stellar.expert/explorer/testnet/contract/CDXZ2HWPSAU3DKACNGTTY3WM6FKN5LPNGMAYFW4KBF74P42RK6SFDRGP",
                description: "Default ID CDXZ2…FDRGP (check env if you redeployed).",
              },
              {
                label: "PHASERLIQ token contract",
                href: "https://stellar.expert/explorer/testnet/contract/CDOAXHWC6YJB7U3ELV67HKJY6HEMJFBNRGJK6WZGUAELBWP3WP77RLFD",
                description: "Default ID CDOAX…RLFD — testnet SAC (check env if you use another token).",
              },
            ],
          },
        ],
      },
      {
        id: "architecture",
        title: "How it works (detailed)",
        blocks: [
          {
            type: "p",
            text: "Forge (/forge): creator connects Freighter, sets collection name, PHASERLIQ price, and artwork (https or ipfs URL, sealed file upload when the server allows, or studio canvas). The app builds and signs create_collection; you receive a collection_id to share.",
          },
          {
            type: "p",
            text: "Market (/dashboard): surfaces collection metadata and prices from the contract / app APIs; each card links to /chamber?collection=ID. Collection 0 is the protocol default pool.",
          },
          {
            type: "p",
            text: "Chamber (/chamber): wallet monitor, PHASERLIQ balance, collection x402 mint price, and phase state (has_phased, utility NFT). Users may request genesis supply when contract policy allows, run settlement (x402 flow + Soroban transaction), and view the artifact with ownership checks when the UI resolves on-chain state.",
          },
          {
            type: "p",
            text: "x402 API (demo / compatibility): routes under app/api/x402 — 402 challenge, supported, verify, settle. Intended for local testing and alignment with Agentic Payments docs; production should use a real x402 facilitator.",
          },
          {
            type: "p",
            text: "Testnet rewards: GET/POST /api/faucet — genesis, daily recharge, and quests; requires ADMIN_SECRET_KEY on the server to sign mints. Operator notes: docs/PHASER_LIQ_REWARDS_TERMINAL_DOC.md.",
          },
          {
            type: "p",
            text: "Classic asset (optional): CLASSIC_LIQ_* and NEXT_PUBLIC_CLASSIC_* let Freighter show a classic trustline asset alongside the Soroban PHASERLIQ contract.",
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
              "Collection: on-chain record with name, creator/treasury, PHASERLIQ mint price, and image URI for metadata.",
              "Protocol pool (collection 0): baseline mint path; other collections are created from the Forge.",
              "PHASERLIQ: testnet liquidity token used for quoted prices and contract payments.",
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
              "Optional server-side image upload: when enabled, Paint/Upload in Forge can publish the sealed file.",
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
            text: "Participant: open Market or follow a link → Chamber with the right collection → connect on the same network (testnet) → check PHASERLIQ balance; use faucet/rewards in the UI if shown → run settlement when balance covers the price.",
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
        title: "PHASERLIQ and explorers",
        blocks: [
          {
            type: "p",
            text: "Amounts are shown in PHASERLIQ; the client converts to stroops and calls the token contract. Symbol PHASERLIQ, 7 decimals, typical on-chain name “Phase Liquidity Token”. In the Chamber, TOKEN_EXPERT links to the token contract on Stellar Expert.",
          },
          {
            type: "links",
            intro: "Default testnet contracts and explorer:",
            items: [
              {
                label: "PHASERLIQ token contract",
                href: "https://stellar.expert/explorer/testnet/contract/CDOAXHWC6YJB7U3ELV67HKJY6HEMJFBNRGJK6WZGUAELBWP3WP77RLFD",
                description: "Repository default ID; verify env if you changed TOKEN_CONTRACT_ID.",
              },
              {
                label: "PHASE Protocol contract",
                href: "https://stellar.expert/explorer/testnet/contract/CDXZ2HWPSAU3DKACNGTTY3WM6FKN5LPNGMAYFW4KBF74P42RK6SFDRGP",
                description: "Core protocol; verify env if you redeployed.",
              },
              {
                label: "Stellar Expert — Testnet",
                href: "https://stellar.expert/explorer/testnet",
                description: "Search accounts, contracts, and transactions.",
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
