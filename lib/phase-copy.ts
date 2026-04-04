import type { AppLang } from "@/components/lang-context"
import type { ImageUriValidationMessages } from "@/lib/phase-protocol"

export type ChamberLogsCopy = {
  chamberOnline: string
  walletRequest: string
  walletLinkedPrefix: string
  walletDenied: string
  walletUnlink: string
  systemDesync: string
  tracePrefix: string
  runtimeFaultPrefix: string
  rebootProcess: string
  manualPhaseStart: string
  detectingLiquidity: string
  authorizingTx: string
  mintingNft: string
  crystallizing: string
  phaseTransitionComplete: string
  mintConfirmedViewPedestal: string
  lowEnergyWarning: string
  x402Initiating: string
  receivingChallenge: string
  signingAuth: string
  settlingPayment: string
  decrypting: string
  x402Ok: string
  forgedOnSettle: string
  faucetEmitting: string
  faucetLoadingSupply: string
  faucetOk: string
  /** Toast / log tras mint; usa `{amount}` (ej. 10.00). */
  faucetReceived: string
  faucetFailPrefix: string
  genesisSupplyRequested: string
  genesisTransferComplete: string
}

export type ArtifactLabelsCopy = {
  registeredDefault: string
  owner: string
  serial: string
  powerLevel: string
  readonly: string
  noVisual: string
  ariaLabel: string
  sepSuffix: string
  dataLocked: string
  contract: string
  terminalRestricted: string
  systemActive: string
  verifying: string
  downloadCertificate: string
  expandPreview: string
  closePreview: string
  unverifiedCopy: string
  /** `{token}` `{sig}` — sello en esquina si hay propiedad verificada. */
  authenticitySealVerified: string
  /** Línea bajo banner terminal bloqueada. */
  accessDeniedLine: string
  /** Estado de metadato público (pre-fusión vs sellado on-chain). */
  stateLiquid: string
  stateSolid: string
  /** Acción solo para el dueño verificado. */
  accessPrivateMetadata: string
  /** Línea bajo el panel público cuando el canal privado está abierto. */
  privateChannelUnlocked: string
  /** Vista verificada pero wallet ≠ owner_of(token) — overlay + blur. */
  previewOnly: string
  /** Breve animación al confirmar titular on-chain. */
  decryptingImage: string
  monitorCollectionName: string
  monitorContractAddr: string
  supplyStabilized: string
  secretId: string
  holderSignature: string
  rawMetadata: string
  pendingOwnershipVerification: string
}

export const phaseCopy: Record<
  AppLang,
  {
    nav: { home: string; market: string; forge: string; chamber: string; lang: string }
    dashboard: {
      title: string
      subtitle: string
      /** Mensaje “blindaje” vs pantallazo (poster sin llave on-chain). */
      shieldBlurb: string
      refresh: string
      refreshing: string
      wallet: string
      connect: string
      connecting: string
      disconnect: string
      empty: string
      noPreview: string
      creator: string
      mint: string
      openChamber: string
      id: string
      priceSuffix: string
      previewPendingFusion: string
      previewUnverifiedCopy: string
      previewChainVerified: string
    }
    studioModal: {
      windowTitle: string
      canvasMeta: string
      file: string
      edit: string
      view: string
      saveSeal: string
      newCanvas: string
      exitDiscard: string
      undo: string
      closePolygon: string
      zoomIn: string
      zoomOut: string
      zoom100: string
      refLine: string
      cancel: string
      clear: string
      seal: string
    }
    studioEditor: {
      tools: string
      pencil: string
      brush: string
      airbrush: string
      eraser: string
      bucket: string
      line: string
      rect: string
      ellipse: string
      polygon: string
      text: string
      select: string
      thickness: string
      paletteTitle: string
      hint: string
      textPlaceholder: string
    }
    imageValidation: ImageUriValidationMessages
    forge: {
      exit: string
      title: string
      market: string
      chamber: string
      intro: string
      pinataTitle: string
      pinataBody: string
      imageSource: string
      paint: string
      upload: string
      url: string
      collectionName: string
      fusionPrice: string
      readout: string
      metadataUrl: string
      urlHelp: string
      fileIpfs: string
      waitingDesign: string
      previewHint: string
      designArtifact: string
      reopenDesigner: string
      studioBlurb: string
      linkWallet: string
      linking: string
      walletLabel: string
      forgeCollection: string
      deploying: string
      disconnect: string
      artPreview: string
      awaitingFeed: string
      urlHint: string
      uploadHint: string
      paintHint: string
      collectionLive: string
      magicLink: string
      copy: string
      copied: string
      openChamber: string
      collectionIdLabel: string
      registerTitle: string
      deployStatus: string
      deployTickers: readonly [string, string, string, string, string]
      errors: {
        connectWallet: string
        nameShort: string
        priceInvalid: string
        selectFile: string
        sealPaint: string
        collectionIdRead: string
        creatorAlreadyHasCollection: string
        clipboard: string
      }
      placeholders: {
        collectionName: string
        price: string
        imageUrl: string
      }
    }
    chamber: {
      exit: string
      market: string
      forge: string
      sync: string
      fullMarket: string
      community: string
      catalogLoading: string
      noCommunity: string
      forgeCta: string
      defaultPool: string
      boot: string
      statusMonitor: string
      invalidCollectionTitle: string
      invalidCollectionBody: string
      lowEnergyTitle: string
      reqLiqPrefix: string
      wallet: string
      offline: string
      liqBalance: string
      collectionId: string
      collectionIdProtocol: string
      x402Price: string
      network: string
      phaseState: string
      nftMinted: string
      liquid: string
      powerLevel: string
      linkWallet: string
      uplinking: string
      disconnect: string
      exhibitionPedestal: string
      mintingTitle: string
      committingLedger: string
      solidState: string
      onChainMeta: string
      stellarExpert: string
      artifactAsciiView: string
      syncingMeta: string
      x402MintPrice: string
      protocolDefaultPool: string
      noImageUri: string
      noImageHint: string
      awaitingPhase: string
      theReactor: string
      x402StreamActive: string
      executeX402: string
      executeSettlement: string
      initializeGenesisSupply: string
      genesisSupplyLoading: string
      manualPhase: string
      solidStateStandby: string
      systemLogs: string
      logsToggle: string
      logsClose: string
      live: string
      nodeDesyncTitle: string
      rebootProcess: string
      collectionTitleLoading: string
      defaultChamberTitle: string
      titleWithName: string
      pedestalWithCreator: string
      pedestalLoading: string
      pedestalDefault: string
      collectionLine: string
      collectionLinkTitle: string
      faucetButton: string
      creatorCanMint: string
      creatorMintRule: string
      creatorAlreadyMinted: string
      freighterManualAddTitle: string
      freighterManualAddBody: string
      protocolStackLabel: string
      logs: ChamberLogsCopy
      artifact: ArtifactLabelsCopy
    }
  }
> = {
  en: {
    nav: {
      home: "← Home",
      market: "Market",
      forge: "Forge",
      chamber: "Chamber",
      lang: "Language",
    },
    dashboard: {
      title: "On-chain collections",
      subtitle:
        "Each card is a PHASE collection. Mint opens the fusion chamber for that collection: pay the listed PHASER_LIQ via initiate_phase and receive the utility NFT.",
      shieldBlurb:
        "A screenshot is just a poster — it is not the contract. Your PHASE utility NFT is the on-chain key; previews here stay low-trust until you verify in the Reactor.",
      refresh: "Refresh ledger",
      refreshing: "Syncing…",
      wallet: "Wallet (optional)",
      connect: "Connect Freighter",
      connecting: "Connecting…",
      disconnect: "Disconnect",
      empty: "No collections yet — forge one first.",
      noPreview: "No image URL",
      creator: "Creator",
      mint: "Mint NFT — pay PHASER_LIQ",
      openChamber: "Open chamber",
      id: "ID",
      priceSuffix: "PHASER_LIQ",
      previewPendingFusion: "[ PENDING_FUSION ]",
      previewUnverifiedCopy: "[ UNVERIFIED_COPY ]",
      previewChainVerified: "[ CHAIN_VERIFIED ]",
    },
    studioModal: {
      windowTitle: "PHASE Art Studio",
      canvasMeta: "px · lossless PNG",
      file: "File",
      edit: "Edit",
      view: "View",
      saveSeal: "Save & seal…",
      newCanvas: "New canvas",
      exitDiscard: "Exit without saving",
      undo: "Undo",
      closePolygon: "Close polygon",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      zoom100: "Zoom 100%",
      refLine: "Inspired by",
      cancel: "Cancel",
      clear: "Clear",
      seal: "Seal",
    },
    studioEditor: {
      tools: "Tools",
      pencil: "Pencil",
      brush: "Brush",
      airbrush: "Airbrush",
      eraser: "Eraser",
      bucket: "Fill",
      line: "Line",
      rect: "Rectangle",
      ellipse: "Ellipse",
      polygon: "Polygon",
      text: "Text",
      select: "Select",
      thickness: "Size",
      paletteTitle: "PHASE palette (greens / cyans / grays)",
      hint: "Canvas {w}×{h}px · lossless PNG on seal · Zoom {z}% · Selection + Del clears region",
      textPlaceholder: "Your text…",
    },
    imageValidation: {
      maxLen: "Image URL must be at most 256 characters.",
      control: "Image URL cannot contain control characters.",
      quotes: "Image URL cannot contain \" or \\ (on-chain JSON).",
      mustHttpsOrIpfs: "On-chain image must be https://… or ipfs://…",
      ipfsCidShort: "Invalid ipfs:// URI (CID too short).",
    },
    forge: {
      exit: "◄ Exit",
      title: "PHASE Forge · Multimodal",
      market: "Market",
      chamber: "Chamber",
      intro:
        "PAINT / UPLOAD → IPFS (Pinata). URL → https:// or ipfs://. Server needs PINATA_JWT in .env.local.",
      pinataTitle: "PINATA_JWT missing",
      pinataBody:
        "Copy .env.local.example to .env.local, add your JWT, restart dev. Use URL mode without Pinata.",
      imageSource: "Image source",
      paint: "Paint",
      upload: "Upload",
      url: "URL",
      collectionName: "Collection name",
      fusionPrice: "Fusion price (PHASER_LIQ)",
      readout: "READOUT",
      metadataUrl: "Metadata image URL",
      urlHelp: "If set, must be https:// or ipfs:// (max 256 chars, no quotes or backslashes).",
      fileIpfs: "File → IPFS (PHASE forge seal) on deploy",
      waitingDesign: "Waiting for artwork",
      previewHint: "Preview active — you can reopen the studio",
      designArtifact: "Design artifact",
      reopenDesigner: "Reopen studio",
      studioBlurb:
        "Built-in editor (JSPaint-style): 1024×768 canvas, zoom, palette — seal then IPFS on forge.",
      linkWallet: "Link wallet",
      linking: "Linking…",
      walletLabel: "Wallet",
      forgeCollection: "Forge new collection",
      deploying: "Deploying on-chain…",
      disconnect: "Disconnect",
      artPreview: "Art preview",
      awaitingFeed: "Awaiting visual",
      urlHint: "HTTPS or IPFS URI",
      uploadHint: "Choose a file",
      paintHint: "Design artifact — left panel",
      collectionLive: "Collection live",
      magicLink: "Share link",
      copy: "Copy link",
      copied: "Copied",
      openChamber: "Open chamber",
      collectionIdLabel: "Collection ID",
      registerTitle: "Register collection",
      deployStatus: "CONTRACT_DEPLOY",
      deployTickers: [
        "WRITING_LEDGER_ENTRY…",
        "BROADCASTING_INVOKE_HOST_FN…",
        "AWAITING_CONSENSUS…",
        "LINKING_CREATOR_ADDRESS…",
        "EMITTING_COLLECTION_CREATED…",
      ],
      errors: {
        connectWallet: "Connect your wallet first.",
        nameShort: "Collection name is too short (min. 2 characters).",
        priceInvalid: "Invalid PHASER_LIQ price.",
        selectFile: "Select an image file.",
        sealPaint: "Seal your design in the studio (PAINT mode) before forging.",
        collectionIdRead: "Could not read collection_id on-chain.",
        creatorAlreadyHasCollection: "This wallet already has a collection (#{id}). Open the chamber for that collection instead of creating a new one.",
        clipboard: "Could not copy to clipboard.",
      },
      placeholders: {
        collectionName: "Crypto-Art 2026",
        price: "5.0",
        imageUrl: "https://… or ipfs://… (empty = no image)",
      },
    },
    chamber: {
      exit: "◄ Exit",
      market: "Market",
      forge: "Forge",
      sync: "Sync",
      fullMarket: "Full market →",
      community: "Community",
      catalogLoading: "Syncing catalog…",
      noCommunity: "No community collections yet.",
      forgeCta: "Forge one",
      defaultPool: "Default pool",
      boot: "[ CHAMBER_BOOT… ]",
      statusMonitor: "STATUS_MONITOR",
      invalidCollectionTitle: "INVALID_COLLECTION_ID",
      invalidCollectionBody:
        "No on-chain metadata for #{id}. Check the forge link or collection id.",
      lowEnergyTitle: "LOW_ENERGY — PROTOCOL_LOCKED",
      reqLiqPrefix: "REQ ≥",
      wallet: "Wallet",
      offline: "— OFFLINE —",
      liqBalance: "PHASER_LIQ_BALANCE",
      collectionId: "Collection_ID",
      collectionIdProtocol: "0 (protocol)",
      x402Price: "X402_Price",
      network: "Network",
      phaseState: "Phase_State",
      nftMinted: "NFT_MINTED",
      liquid: "LIQUID",
      powerLevel: "POWER_LEVEL",
      linkWallet: "LINK_WALLET",
      uplinking: "UPLINK…",
      disconnect: "DISCONNECT",
      exhibitionPedestal: "EXHIBITION_PEDESTAL // SMART_ASSET",
      mintingTitle: "MINTING_PHASE_UTILITY_NFT...",
      committingLedger: "COMMITTING_TO_SOROBAN_LEDGER",
      solidState: "SOLID_STATE // ON_CHAIN",
      onChainMeta: "name() · symbol() · owner_of() · token_uri",
      stellarExpert: "[ STELLAR_EXPERT ] ↗",
      artifactAsciiView: "ARTIFACT_ASCII_VIEW",
      syncingMeta: "[ SYNCING_COLLECTION_METADATA… ]",
      x402MintPrice: "X402_MINT_PRICE",
      protocolDefaultPool: "Protocol default pool",
      noImageUri: "[ NO_COLLECTION_IMAGE_URI ]",
      noImageHint: "Creator: add an image when forging",
      awaitingPhase: "[ AWAITING_PHASE — MINT_TO_REVEAL_ARTIFACT ]",
      theReactor: "THE_REACTOR",
      x402StreamActive: "X402_STREAM_ACTIVE",
      executeX402: "EXECUTE_X402_SETTLEMENT",
      executeSettlement: "[ EXECUTE_SETTLEMENT ]",
      initializeGenesisSupply: "[ ⚡ INITIALIZE_GENESIS_SUPPLY ]",
      genesisSupplyLoading: "INITIALIZING_GENESIS_SUPPLY...",
      manualPhase: "MANUAL_PHASE_TRANSITION",
      solidStateStandby: "SOLID_STATE_ACTIVE — REACTOR_STANDBY",
      systemLogs: "SYSTEM_LOGS",
      logsToggle: "Logs",
      logsClose: "Close logs",
      live: "LIVE",
      nodeDesyncTitle: "NODE_DESYNC_DETECTED",
      rebootProcess: "REBOOT_PROCESS",
      collectionTitleLoading: "COLLECTION //",
      defaultChamberTitle: "PHASE_PROTOCOL // DEFAULT_POOL",
      titleWithName: "{name} // #{id}",
      pedestalWithCreator: "{name} · CREATOR {addr}",
      pedestalLoading: "LOADING_COLLECTION_METADATA…",
      pedestalDefault: "PROTOCOL_DEFAULT · CORE_LIQUIDITY_POOL",
      collectionLine: "Collection #{id} · {name}",
      collectionLinkTitle: "Collection #{id}",
      faucetButton: "[ ⚡ RECHARGE_PHASER_LIQ ]",
      creatorCanMint: "CREATOR_MINT_ENABLED",
      creatorMintRule: "Creator can mint this collection too (one utility NFT per wallet per collection).",
      creatorAlreadyMinted: "Creator already minted this collection with this wallet.",
      freighterManualAddTitle: "FREIGHTER_COLLECTIBLE",
      freighterManualAddBody:
        "If it does not appear automatically: Freighter -> Collectibles -> Add manually -> paste contract + token ID.",
      protocolStackLabel: "x402 · SEP-41 token flows · SEP-50 collectible · SEP-0020 validator metadata",
      logs: {
        chamberOnline: "[ CHAMBER_ONLINE ] AWAITING_OPERATOR_HANDSHAKE…",
        walletRequest: "[ WALLET ] REQUESTING_SIGNER_CHANNEL…",
        walletLinkedPrefix: "[ WALLET_LINKED ]",
        walletDenied: "[ WALLET_DENIED ] ABORT",
        walletUnlink: "[ WALLET_UNLINK ] SESSION_CLEARED",
        systemDesync: "[ SYSTEM_DESYNC: RE-ESTABLISHING STELLAR_NODE_CONNECTION... ]",
        tracePrefix: "[ TRACE ]",
        runtimeFaultPrefix: "[ RUNTIME_FAULT ]",
        rebootProcess: "[ REBOOT_PROCESS ] CLEARING_BUFFERS / RESYNC…",
        manualPhaseStart: "[ MANUAL_PHASE ] SEQUENCE_START",
        detectingLiquidity: "[ DETECTING_LIQUIDITY... ]",
        authorizingTx: "[ AUTHORIZING_SOROBAN_TRANSACTION... ]",
        mintingNft: "[ MINTING_PHASE_UTILITY_NFT... ]",
        crystallizing: "[ CRYSTALLIZING_IDENTITY... ]",
        phaseTransitionComplete: "[ PHASE_TRANSITION_COMPLETE ]",
        mintConfirmedViewPedestal: "[ PHASE_NFT_MINT_CONFIRMED ] VIEW_PEDESTAL",
        lowEnergyWarning: "[ LOW_ENERGY_WARNING: PROTOCOL_LOCKED ]",
        x402Initiating: "[ X402 ] INITIATING_SETTLEMENT_CHALLENGE…",
        receivingChallenge: "[ RECEIVING_CHALLENGE... ]",
        signingAuth: "[ SIGNING_AUTH_ENTRY... ]",
        settlingPayment: "[ SETTLING_PAYMENT... ]",
        decrypting: "[ DECRYPTING_PROTECTED_DATA... ]",
        x402Ok: "[ X402_PIPELINE_OK ] ENERGY_ROUTED",
        forgedOnSettle: "[ PHASE_NFT_FORGED_ON_SETTLE ] CHECK_PEDESTAL",
        faucetEmitting: "[ EMITTING_PHASER_LIQ_FOR_OPERATOR... ]",
        faucetLoadingSupply: "[ LOADING_SUPPLY... ]",
        faucetOk: "[ PHASER_LIQ_MINT_CONFIRMED ] BALANCE_REFRESHED",
        faucetReceived: "[ +{amount} PHASER_LIQ RECEIVED ]",
        faucetFailPrefix: "[ FAUCET_FAULT ]",
        genesisSupplyRequested: "[ SOLICITANDO_ENERGÍA_AL_NÚCLEO... ]",
        genesisTransferComplete: "[ GENESIS_SUPPLY_TRANSFER_OK ] REACTOR_CHARGED",
      },
      artifact: {
        registeredDefault: "PHASE_UTILITY_ARTIFACT // REGISTERED",
        owner: "OWNER",
        serial: "SERIAL",
        powerLevel: "POWER_LEVEL",
        readonly: "[ SMART_ASSET_VIEW // READ_ONLY ]",
        noVisual: "[ NO_VISUAL_CHANNEL ]",
        ariaLabel: "Phase utility NFT artifact",
        sepSuffix: "// SEP-50",
        dataLocked: "[ DATA_LOCKED ]",
        contract: "CONTRACT",
        terminalRestricted: "TERMINAL_LOCKED // CLASSIFIED",
        systemActive: "SYSTEM_ACTIVE // OWNERSHIP_VERIFIED",
        verifying: "[ VERIFYING_CHAIN… ]",
        downloadCertificate: "[ DESCARGAR_CERTIFICADO ]",
        expandPreview: "EXPAND_VIEW // FULL_RES",
        closePreview: "[ CLOSE ]",
        unverifiedCopy: "[ UNVERIFIED_COPY ]",
        authenticitySealVerified: "✦ ON_CHAIN #{token} · VIEWER_SIG:{sig}",
        accessDeniedLine: "SCREENSHOT ≠ LEDGER_KEY — REACTOR_LOCKED",
        stateLiquid: "LIQUID",
        stateSolid: "SOLID",
        accessPrivateMetadata: "[ ACCESS_PRIVATE_METADATA ]",
        privateChannelUnlocked: "PRIVATE_METADATA_CHANNEL // UNLOCKED",
        previewOnly: "[ PREVIEW_ONLY ]",
        decryptingImage: "[ DECRYPTING_IMAGE ]",
        monitorCollectionName: "COLLECTION_NAME",
        monitorContractAddr: "CONTRACT_ADDR",
        supplyStabilized: "SUPPLY_STABILIZED",
        secretId: "SECRET_ID",
        holderSignature: "HOLDER_SIGNATURE",
        rawMetadata: "RAW_METADATA",
        pendingOwnershipVerification: "[ PENDING_OWNERSHIP_VERIFICATION ]",
      },
    },
  },
  es: {
    nav: {
      home: "← Inicio",
      market: "Mercado",
      forge: "Forja",
      chamber: "Cámara",
      lang: "Idioma",
    },
    dashboard: {
      title: "Colecciones on-chain",
      subtitle:
        "Cada tarjeta es una colección PHASE. Mint abre la cámara de fusión: pagas el PHASER_LIQ indicado con initiate_phase y recibes el NFT de utilidad.",
      shieldBlurb:
        "Un pantallazo es solo un póster — no es el contrato. Tu NFT de utilidad PHASE es la llave on-chain; aquí las vistas son de baja confianza hasta que verifiques en el Reactor.",
      refresh: "Actualizar ledger",
      refreshing: "Sincronizando…",
      wallet: "Wallet (opcional)",
      connect: "Conectar Freighter",
      connecting: "Conectando…",
      disconnect: "Desconectar",
      empty: "Aún no hay colecciones — crea una en la forja.",
      noPreview: "Sin URL de imagen",
      creator: "Creador",
      mint: "Acuñar NFT — pagar PHASER_LIQ",
      openChamber: "Abrir cámara",
      id: "ID",
      priceSuffix: "PHASER_LIQ",
      previewPendingFusion: "[ PENDING_FUSION ]",
      previewUnverifiedCopy: "[ COPIA_NO_VERIFICADA ]",
      previewChainVerified: "[ VERIFICADO_EN_CADENA ]",
    },
    studioModal: {
      windowTitle: "PHASE Estudio de arte",
      canvasMeta: "px · PNG sin pérdida",
      file: "Archivo",
      edit: "Edición",
      view: "Ver",
      saveSeal: "Guardar y sellar…",
      newCanvas: "Lienzo nuevo",
      exitDiscard: "Salir sin guardar",
      undo: "Deshacer",
      closePolygon: "Cerrar polígono",
      zoomIn: "Acercar",
      zoomOut: "Alejar",
      zoom100: "Zoom 100%",
      refLine: "Inspirado en",
      cancel: "Cancelar",
      clear: "Borrar",
      seal: "Sellar",
    },
    studioEditor: {
      tools: "Herramientas",
      pencil: "Lápiz",
      brush: "Pincel",
      airbrush: "Aerógrafo",
      eraser: "Borrador",
      bucket: "Cubo",
      line: "Línea",
      rect: "Rectángulo",
      ellipse: "Elipse",
      polygon: "Polígono",
      text: "Texto",
      select: "Selección",
      thickness: "Grosor",
      paletteTitle: "Paleta PHASE (verdes / cianes / grises)",
      hint: "Lienzo {w}×{h}px · PNG sin pérdida al sellar · Zoom {z}% · Selección + Supr borra región",
      textPlaceholder: "Tu texto…",
    },
    imageValidation: {
      maxLen: "La URL de imagen debe tener como máximo 256 caracteres.",
      control: "La URL de imagen no puede contener caracteres de control.",
      quotes: "La URL de imagen no puede contener \" ni \\ (JSON on-chain).",
      mustHttpsOrIpfs: "La imagen on-chain debe ser https://… o ipfs://…",
      ipfsCidShort: "URI ipfs:// inválida (CID demasiado corto).",
    },
    forge: {
      exit: "◄ Salir",
      title: "PHASE Forja · Multimodal",
      market: "Mercado",
      chamber: "Cámara",
      intro:
        "PAINT / SUBIDA → IPFS (Pinata). URL → https:// o ipfs://. El servidor necesita PINATA_JWT en .env.local.",
      pinataTitle: "Falta PINATA_JWT",
      pinataBody:
        "Copia .env.local.example a .env.local, añade el JWT y reinicia dev. Usa modo URL sin Pinata.",
      imageSource: "Origen de imagen",
      paint: "Pintar",
      upload: "Subir",
      url: "URL",
      collectionName: "Nombre de colección",
      fusionPrice: "Precio de fusión (PHASER_LIQ)",
      readout: "LECTURA",
      metadataUrl: "URL imagen (metadata)",
      urlHelp: "Si no está vacío, debe ser https:// o ipfs:// (máx. 256 caracteres, sin comillas ni \\).",
      fileIpfs: "Archivo → IPFS (sello PHASE Forja) al desplegar",
      waitingDesign: "Esperando diseño",
      previewHint: "Vista previa activa — puedes reabrir el estudio",
      designArtifact: "Diseñar artefacto",
      reopenDesigner: "Reabrir estudio",
      studioBlurb:
        "Editor integrado (estilo JSPaint): lienzo 1024×768, zoom, paleta — sellar y luego IPFS al forjar.",
      linkWallet: "Vincular wallet",
      linking: "Vinculando…",
      walletLabel: "Wallet",
      forgeCollection: "Forjar colección nueva",
      deploying: "Desplegando on-chain…",
      disconnect: "Desconectar",
      artPreview: "Vista previa",
      awaitingFeed: "Esperando imagen",
      urlHint: "URI HTTPS o IPFS",
      uploadHint: "Elige archivo",
      paintHint: "Diseña en el panel izquierdo",
      collectionLive: "Colección en vivo",
      magicLink: "Enlace para compartir",
      copy: "Copiar enlace",
      copied: "Copiado",
      openChamber: "Abrir cámara",
      collectionIdLabel: "ID de colección",
      registerTitle: "Registrar colección",
      deployStatus: "DESPLIEGUE_CONTRATO",
      deployTickers: [
        "ESCRIBIENDO_ENTRADA_LEDGER…",
        "DIFUSIÓN_INVOKE_HOST_FN…",
        "ESPERANDO_CONSENSO…",
        "ENLACE_DIRECCIÓN_CREADOR…",
        "EMITIENDO_COLLECTION_CREATED…",
      ],
      errors: {
        connectWallet: "Conecta la wallet primero.",
        nameShort: "Nombre de colección demasiado corto (mín. 2 caracteres).",
        priceInvalid: "Precio PHASER_LIQ inválido.",
        selectFile: "Selecciona un archivo de imagen.",
        sealPaint: "Sellá el diseño en el estudio (modo PAINT) antes de forjar.",
        collectionIdRead: "No se pudo leer collection_id on-chain.",
        creatorAlreadyHasCollection: "Esta wallet ya tiene una colección (#{id}). Abre la cámara de esa colección en lugar de crear otra.",
        clipboard: "No se pudo copiar al portapapeles.",
      },
      placeholders: {
        collectionName: "Cripto-Arte 2026",
        price: "5.0",
        imageUrl: "https://… o ipfs://… (vacío = sin imagen)",
      },
    },
    chamber: {
      exit: "◄ Salir",
      market: "Mercado",
      forge: "Forja",
      sync: "Sincronizar",
      fullMarket: "Mercado completo →",
      community: "Comunidad",
      catalogLoading: "Sincronizando catálogo…",
      noCommunity: "Aún no hay colecciones de la comunidad.",
      forgeCta: "Forjar una",
      defaultPool: "Pool por defecto",
      boot: "[ ARRANQUE_CÁMARA… ]",
      statusMonitor: "MONITOR_ESTADO",
      invalidCollectionTitle: "ID_COLECCIÓN_INVÁLIDO",
      invalidCollectionBody:
        "No hay metadata on-chain para #{id}. Revisa el enlace de la forja o el id de colección.",
      lowEnergyTitle: "ENERGÍA_BAJA — PROTOCOLO_BLOQUEADO",
      reqLiqPrefix: "REQ ≥",
      wallet: "Wallet",
      offline: "— DESCONECTADO —",
      liqBalance: "SALDO_PHASER_LIQ",
      collectionId: "ID_Colección",
      collectionIdProtocol: "0 (protocolo)",
      x402Price: "Precio_X402",
      network: "Red",
      phaseState: "Estado_Fase",
      nftMinted: "NFT_ACUÑADO",
      liquid: "LÍQUIDO",
      powerLevel: "NIVEL_ENERGÍA",
      linkWallet: "VINCULAR_WALLET",
      uplinking: "ENLACE…",
      disconnect: "DESCONECTAR",
      exhibitionPedestal: "PEDESTAL_EXPOSICIÓN // ACTIVO_INTELIGENTE",
      mintingTitle: "ACUÑANDO_NFT_UTILIDAD_FASE...",
      committingLedger: "REGISTRO_EN_LEDGER_SOROBAN",
      solidState: "ESTADO_SÓLIDO // ON_CHAIN",
      onChainMeta: "name() · symbol() · owner_of() · token_uri",
      stellarExpert: "[ STELLAR_EXPERT ] ↗",
      artifactAsciiView: "VISTA_ASCII_ARTEFACTO",
      syncingMeta: "[ SINCRONIZANDO_METADATA_COLECCIÓN… ]",
      x402MintPrice: "PRECIO_MINT_X402",
      protocolDefaultPool: "Pool de liquidez por defecto del protocolo",
      noImageUri: "[ SIN_URI_IMAGEN_COLECCIÓN ]",
      noImageHint: "Creador: añade imagen al forjar",
      awaitingPhase: "[ ESPERANDO_FASE — MINT_PARA_REVELAR_ARTEFACTO ]",
      theReactor: "EL_REACTOR",
      x402StreamActive: "X402_FLUJO_ACTIVO",
      executeX402: "EJECUTAR_LIQUIDACIÓN_X402",
      executeSettlement: "[ EXECUTE_SETTLEMENT ]",
      initializeGenesisSupply: "[ ⚡ INITIALIZE_GENESIS_SUPPLY ]",
      genesisSupplyLoading: "INICIALIZANDO_GENESIS_SUPPLY...",
      manualPhase: "TRANSICIÓN_FASE_MANUAL",
      solidStateStandby: "ESTADO_SÓLIDO_ACTIVO — REACTOR_EN_ESPERA",
      systemLogs: "REGISTRO_SISTEMA",
      logsToggle: "Logs",
      logsClose: "Cerrar registro",
      live: "EN_VIVO",
      nodeDesyncTitle: "DESINCRONIZACIÓN_NODO_DETECTADA",
      rebootProcess: "REINICIAR_PROCESO",
      collectionTitleLoading: "COLECCIÓN //",
      defaultChamberTitle: "PHASE_PROTOCOL // POOL_POR_DEFECTO",
      titleWithName: "{name} // #{id}",
      pedestalWithCreator: "{name} · CREADOR {addr}",
      pedestalLoading: "CARGANDO_METADATA_COLECCIÓN…",
      pedestalDefault: "PROTOCOLO_POR_DEFECTO · POOL_LIQUIDEZ_CENTRAL",
      collectionLine: "Colección #{id} · {name}",
      collectionLinkTitle: "Colección #{id}",
      faucetButton: "[ ⚡ SOLICITAR_PHASER_LIQ ]",
      creatorCanMint: "CREADOR_MINT_HABILITADO",
      creatorMintRule: "El creador también puede mintear esta colección (1 NFT de utilidad por wallet por colección).",
      creatorAlreadyMinted: "El creador ya minteó esta colección con esta wallet.",
      freighterManualAddTitle: "COLECCIONABLE_EN_FREIGHTER",
      freighterManualAddBody:
        "Si no aparece automático: Freighter -> Collectibles -> Add manually -> pega contrato + token ID.",
      protocolStackLabel: "x402 · flujos token SEP-41 · coleccionable SEP-50 · metadata validador SEP-0020",
      logs: {
        chamberOnline: "[ CÁMARA_EN_LÍNEA ] ESPERANDO_ENLACE_OPERADOR…",
        walletRequest: "[ WALLET ] SOLICITANDO_CANAL_FIRMANTE…",
        walletLinkedPrefix: "[ WALLET_VINCULADA ]",
        walletDenied: "[ WALLET_DENEGADA ] ABORTAR",
        walletUnlink: "[ WALLET_DESVINCULADA ] SESIÓN_CERRADA",
        systemDesync: "[ DESINCRONIZACIÓN: RESTABLECIENDO_CONEXIÓN_NODO_STELLAR... ]",
        tracePrefix: "[ TRAZA ]",
        runtimeFaultPrefix: "[ FALLO_EJECUCIÓN ]",
        rebootProcess: "[ REINICIO_PROCESO ] VACIANDO_BUFFERS / RESYNC…",
        manualPhaseStart: "[ FASE_MANUAL ] INICIO_SECUENCIA",
        detectingLiquidity: "[ DETECTANDO_LIQUIDEZ... ]",
        authorizingTx: "[ AUTORIZANDO_TRANSACCIÓN_SOROBAN... ]",
        mintingNft: "[ ACUÑANDO_NFT_UTILIDAD_FASE... ]",
        crystallizing: "[ CRISTALIZANDO_IDENTIDAD... ]",
        phaseTransitionComplete: "[ TRANSICIÓN_FASE_COMPLETA ]",
        mintConfirmedViewPedestal: "[ NFT_FASE_CONFIRMADO ] VER_PEDESTAL",
        lowEnergyWarning: "[ AVISO_ENERGÍA_BAJA: PROTOCOLO_BLOQUEADO ]",
        x402Initiating: "[ X402 ] INICIANDO_DESAFÍO_LIQUIDACIÓN…",
        receivingChallenge: "[ RECIBIENDO_DESAFÍO... ]",
        signingAuth: "[ FIRMANDO_ENTRADA_AUTH... ]",
        settlingPayment: "[ LIQUIDANDO_PAGO... ]",
        decrypting: "[ DESCIFRANDO_DATOS_PROTEGIDOS... ]",
        x402Ok: "[ X402_PIPELINE_OK ] ENERGÍA_ENRUTADA",
        forgedOnSettle: "[ NFT_FASE_FORJADO_AL_LIQUIDAR ] REVISAR_PEDESTAL",
        faucetEmitting: "[ EMITIENDO_PHASER_LIQ_PARA_OPERADOR... ]",
        faucetLoadingSupply: "[ SUMINISTRO_EN_CURSO... ]",
        faucetOk: "[ PHASER_LIQ_MINT_CONFIRMADO ] SALDO_ACTUALIZADO",
        faucetReceived: "[ +{amount} PHASER_LIQ RECIBIDOS ]",
        faucetFailPrefix: "[ FALLO_FAUCET ]",
        genesisSupplyRequested: "[ SOLICITANDO_ENERGÍA_AL_NÚCLEO... ]",
        genesisTransferComplete: "[ GENESIS_SUPPLY_TRANSFER_OK ] REACTOR_CARGADO",
      },
      artifact: {
        registeredDefault: "ARTEFACTO_UTILIDAD_PHASE // REGISTRADO",
        owner: "PROPIETARIO",
        serial: "SERIE",
        powerLevel: "NIVEL_ENERGÍA",
        readonly: "[ VISTA_ACTIVO_INTELIGENTE // SOLO_LECTURA ]",
        noVisual: "[ SIN_CANAL_VISUAL ]",
        ariaLabel: "Artefacto NFT de utilidad PHASE",
        sepSuffix: "// SEP-50",
        dataLocked: "[ DATOS_BLOQUEADOS ]",
        contract: "CONTRATO",
        terminalRestricted: "TERMINAL_BLOQUEADA // CLASIFICADO",
        systemActive: "SISTEMA_ACTIVO // PROPIEDAD_VERIFICADA",
        verifying: "[ VERIFICANDO_CADENA… ]",
        downloadCertificate: "[ DESCARGAR_CERTIFICADO ]",
        expandPreview: "AMPLIAR_VISTA // FULL_RES",
        closePreview: "[ CERRAR ]",
        unverifiedCopy: "[ COPIA_NO_VERIFICADA ]",
        authenticitySealVerified: "✦ ON_CHAIN #{token} · FIRMA_VISOR:{sig}",
        accessDeniedLine: "CAPTURA ≠ CLAVE_LEDGER — REACTOR_BLOQUEADO",
        stateLiquid: "LÍQUIDO",
        stateSolid: "SÓLIDO",
        accessPrivateMetadata: "[ ACCEDER_METADATA_PRIVADA ]",
        privateChannelUnlocked: "CANAL_METADATA_PRIVADA // DESBLOQUEADO",
        previewOnly: "[ SOLO_VISTA_PREVIA ]",
        decryptingImage: "[ DESCIFRANDO_IMAGEN ]",
        monitorCollectionName: "NOMBRE_COLECCIÓN",
        monitorContractAddr: "DIRECCIÓN_CONTRATO",
        supplyStabilized: "SUMINISTRO_ESTABILIZADO",
        secretId: "ID_SECRETO",
        holderSignature: "FIRMA_TITULAR",
        rawMetadata: "METADATA_CRUDA",
        pendingOwnershipVerification: "[ PENDIENTE_VERIFICACIÓN_PROPIEDAD ]",
      },
    },
  },
}

export function pickCopy(lang: AppLang) {
  return phaseCopy[lang]
}
