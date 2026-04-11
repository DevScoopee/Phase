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
  /** Antes del settle: se abre Stellar Wallets Kit para elegir la wallet que firma y recibe el NFT. */
  walletKitPickerForSettle: string
  /** Usuario cerró el modal del kit sin elegir wallet. */
  walletKitPickerDismissed: string
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
  /** Narrativa: antes de abrir Freighter para changeTrust (recompensas LIQ). */
  classicTrustlineEstablishing: string
  classicTrustlineFreighter: string
  classicTrustlineConfirmed: string
  classicTrustlineRejected: string
  classicTrustlineAccountMissing: string
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
  /** Artefacto verificado: estándar de metadata (SEP-20). */
  metadataStandard: string
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
  /** Imagen remota no carga (CORS, gateway IPFS, URL caída). */
  imageLoadHint: string
  openImageUrl: string
}

/** PhaseError 1..13; índice 0 sin usar. Misma lista para forja y cámara. */
const PHASE_HOST_CONTRACT_ERRORS_EN: readonly string[] = [
  "",
  "You already hold a PHASE for this collection (AlreadyPhased).",
  "Not enough PHASELQ on the Soroban token contract this app uses. Freighter may show classic PHASELQ while settle reads the SAC—use the faucet, wait for confirmation, or fund the same C… contract.",
  "Token transfer failed inside the protocol (TransferFailed). Retry or check SAC balance.",
  "Wrong token contract: PHASE expects its authorized PHASELQ SAC (UnauthorizedToken). Check NEXT_PUBLIC_PHASER_TOKEN_ID matches this deployment.",
  "This invoice was already settled or cannot be paid again (SettlementFailed). Start a new x402 flow.",
  "Invalid x402 invoice (InvalidInvoice).",
  "Unknown or invalid collection id (InvalidCollection).",
  "This wallet already created a collection (CreatorAlreadyHasCollection). Open Forge / Chamber for that collection id.",
  "Amount is below this collection’s fusion price (AmountBelowCollectionPrice).",
  "Collection metadata breaks protocol rules—name, price, or image URI (InvalidCollectionMetadata).",
  "That PHASE NFT id does not exist (NftNotFound).",
  "You are not the on-chain owner of that NFT (NotNftOwner).",
  "Cannot transfer a PHASE NFT to yourself (SelfTransfer).",
]

const PHASE_HOST_CONTRACT_ERRORS_ES: readonly string[] = [
  "",
  "Ya tenés un PHASE para esta colección (AlreadyPhased).",
  "PHASELQ insuficiente en el contrato Soroban (SAC) que usa esta app. Freighter puede mostrar saldo clásico pero el settle lee el SAC—usá el faucet, esperá confirmación o fondeá el mismo contrato C….",
  "Falló una transferencia de token en el protocolo (TransferFailed). Reintentá o revisá saldo en el SAC.",
  "Contrato de token incorrecto: PHASE solo acepta el SAC PHASELQ autorizado (UnauthorizedToken). Verificá NEXT_PUBLIC_PHASER_TOKEN_ID con este despliegue.",
  "Esa factura ya se liquidó o no se puede pagar de nuevo (SettlementFailed). Iniciá un flujo x402 nuevo.",
  "Factura x402 inválida (InvalidInvoice).",
  "Id de colección inexistente o inválido (InvalidCollection).",
  "Esta wallet ya creó una colección (CreatorAlreadyHasCollection). Abrí Forja/Cámara con ese id.",
  "El monto es menor que el precio de fusión de la colección (AmountBelowCollectionPrice).",
  "Los metadatos de la colección no cumplen las reglas del protocolo (InvalidCollectionMetadata).",
  "Ese id de NFT PHASE no existe (NftNotFound).",
  "No sos el dueño on-chain de ese NFT (NotNftOwner).",
  "No podés transferir un NFT PHASE a vos mismo (SelfTransfer).",
]

const PHASE_HOST_CONTRACT_UNKNOWN_EN =
  "PHASE contract host error #{code}. See contracts/phase-protocol (PhaseError) or the full host diagnostic."
const PHASE_HOST_CONTRACT_UNKNOWN_ES =
  "Error de host en contrato PHASE #{code}. Ver contracts/phase-protocol (PhaseError) o el diagnóstico completo del host."

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
      back: string
      myArtifactsSection: string
      platformListings: string
      sellNft: string
      sellModalTitle: string
      buyerAddressLabel: string
      buyerHint: string
      listingPriceLabel: string
      listingPublish: string
      listingHint: string
      transferNft: string
      transferBusy: string
      cancel: string
      close: string
      cancelListing: string
      listingLoadError: string
      transferWasmHint: string
      /** Bóveda PHASE: lista por RPC (owner_of), sin indexador de terceros. */
      vaultRpcTitle: string
      vaultRpcBlurb: string
      vaultRpcLoading: string
      vaultRpcEmpty: string
      vaultRpcError: string
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
      oracleBadge: string
      market: string
      chamber: string
      intro: string
      anomalyLabel: string
      collectionName: string
      fusionPrice: string
      readout: string
      linkWallet: string
      linking: string
      walletLabel: string
      initiateAgent: string
      forgeCollection: string
      deploying: string
      disconnect: string
      artPreview: string
      lorePreview: string
      awaitingFeed: string
      oracleHint: string
      collectionLive: string
      magicLink: string
      copy: string
      copied: string
      openChamber: string
      collectionIdLabel: string
      registerTitle: string
      tabOracle: string
      tabManual: string
      manualBadge: string
      manualIntro: string
      manualDropLabel: string
      manualDropHint: string
      manualUrlLabel: string
      manualLoreLabel: string
      manualLorePlaceholder: string
      manualUploadMint: string
      manualAwaiting: string
      manualAwaitingHint: string
      /** Mini rail UX en /forge: paso 1 (Oráculo). */
      uxRailStepAOracle: string
      /** Mini rail UX en /forge: paso 1 (Manual). */
      uxRailStepAManual: string
      /** Mini rail UX en /forge: paso 2 (colección + precio + despliegue). */
      uxRailStepB: string
      deployStatus: string
      agentDeployStatus: string
      deployTickers: readonly [string, string, string, string, string]
      agentProcessTickers: readonly [string, string, string]
      signingPayment: string
      paywallNegotiating: string
      trustline_section_title: string
      trustline_standby: string
      trustline_signing: string
      trustline_syncing: string
      trustline_ready: string
      trustline_get_testnet_xlm: string
      trustline_msg_initialized: string
      trustline_msg_empty_account: string
      trustline_msg_connect_wallet: string
      trustline_msg_config_missing: string
      trustline_msg_waiting_confirmation: string
      trustline_msg_protocol_ready: string
      trustline_gas_label: string
      trustline_friendbot_link: string
      /** Subtítulo bajo el asset (qué hace este bloque). */
      trustline_asset_hint: string
      trustline_albedo_prep_title: string
      trustline_albedo_prep_body: string
      trustline_albedo_prep_button: string
      trustline_albedo_prep_working: string
      oracle_blocked_msg: string
      mint_blocked_msg: string
      ipfsOracleHint: string
      errors: {
        connectWallet: string
        nameShort: string
        priceInvalid: string
        collectionIdRead: string
        creatorAlreadyHasCollection: string
        clipboard: string
        anomalyShort: string
        agentRequest: string
        agentPay: string
        agentNot402: string
        fetchAgentImage: string
        finalUri: string
        lowEnergyAgent: string
        /** Saldo no comprobado por fallo temporal del RPC (no confundir con PHASELQ bajo). */
        rpcBalanceCheckFailed: string
        /** RPC Soroban testnet saturado (503 / overload). */
        sorobanTestnetCongested: string
        /** Freighter en mainnet u otra red; `{network}` = nombre que reporta Freighter. */
        freighterWrongNetwork: string
        manualNoImage: string
        /** Usuario cerró Freighter / rechazó la firma del settle x402 */
        userAbortedFreighter: string
        /** Settle on-chain OK pero el servidor Oracle respondió ≥500 */
        oracleOfflineAfterPayment: string
        /** Fallback cuando el mensaje no es legible (códigos internos) */
        fusionChamberHalted: string
        /** Índice 0 vacío; 1..13 = PhaseError on-chain (ver contracts/phase-protocol). */
        phaseHostContractErrors: readonly string[]
        phaseHostContractUnknown: string
      }
      placeholders: {
        collectionName: string
        price: string
        anomaly: string
        manualImageUrl: string
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
      /** Si `getTokenBalance` > saldo del SAC del protocolo; `{total}` = formato 0.00 */
      liqBalanceIssuerMismatch: string
      collectionId: string
      collectionIdProtocol: string
      x402Price: string
      network: string
      networkValue: string
      signalLabel: string
      classicAssetLabel: string
      freighterBalanceLabel: string
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
      /** THE_REACTOR: un solo CTA para enviar el NFT desde custodia del emisor a la wallet conectada. */
      reactorClaimNftCta: string
      /** NFT ya en la wallet conectada — reactor en espera (enlace opcional al dashboard). */
      reactorNftSecuredHint: string
      /** `owner_of` no es el emisor ni la wallet: no se puede COLECTAR desde reactor. */
      reactorClaimUnavailableHint: string
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
      rewardsSectionTitle: string
      /** Columna derecha: genesis/daily + panel COLLECT NFT (sin quests). */
      collectInfoPanelTitle: string
      /** Bajo THE_REACTOR: cadena de misiones (quests). */
      reactorQuestsSectionTitle: string
      rewardsHelpAria: string
      rewardsHelpClose: string
      rewardsHelpModalTitle: string
      rewardsHelpLiqTitle: string
      rewardsHelpLiqBody: string
      rewardsHelpQuestsTitle: string
      rewardsHelpQuestsBody: string
      rewardsQuestProgress: string
      /** Panel COLLECT: ya sos owner on-chain del utility NFT (columna derecha). */
      rewardsNftInWalletTitle: string
      /** Enlace a Stellar Expert del contrato PHASE (C…). */
      rewardsNftStellarExpertLink: string
      /** Panel custodia emisor → COLLECT (cualquier wallet; el servidor firma el transfer). */
      rewardsNftCollectPanelTitle: string
      /** `{tokenId}` `{issuerShort}` — primeros caracteres del emisor clásico PHASELQ. */
      rewardsNftCollectPanelBody: string
      /** `{tokenId}` — owner on-chain no es el emisor; COLLECT no aplica. */
      rewardsNftNotIssuerCustodyBody: string
      rewardsNftCollectButton: string
      rewardsNftCollectSending: string
      /** Mientras corre POST /api/phase-nft/verify para COLLECT. */
      rewardsNftCollectVerifying: string
      /** Título si verify falla; el detalle sale del estado (mensaje API). */
      rewardsNftCollectVerifyFailed: string
      /** Pedestal: NFT aún en custodia del emisor; ancla al panel lateral COLLECT. */
      pedestalIssuerCustodyHint: string
      pedestalIssuerCustodyScrollLink: string
      /** Pedestal: wallets sin galería Soroban — el NFT existe en ledger aunque no se vea en la UI. */
      walletNftVisibilityTitle: string
      walletNftVisibilityBody: string
      creatorCanMint: string
      creatorMintRule: string
      creatorAlreadyMinted: string
      freighterManualAddTitle: string
      freighterManualAddBody: string
      freighterManualAddTroubleshoot: string
      /** Pedestal: self-transfer para re-emitir evento `transfer` (útil si una wallet externa cachea por eventos). */
      freighterIndexPingButton: string
      freighterIndexPingToastOk: string
      freighterIndexPingToastFail: string
      /** Pedestal: comprobar name/symbol/owner_of/token_uri + JSON metadata vs SEP-0050 (Freighter). */
      freighterSep50CheckButton: string
      freighterSep50CheckIntro: string
      freighterSep50CheckFailToast: string
      /** Pedestal: ya sos owner on-chain; Freighter no lista solo — Add manually. */
      freighterOwnerOnChainAddBody: string
      /** Meta pedestal: contrato PHASE (NFT SEP-20), no el SAC PHASELQ. */
      onChainMetaNftContractLabel: string
      /** Meta pedestal: contrato SAC del token fungible PHASELQ (liquidez). */
      onChainMetaPhaselqSacLabel: string
      /** Un clic: portapapeles = línea1 contrato C… NFT, línea2 id numérico (sin #). */
      freighterCopyBundleButton: string
      freighterCopyBundleToast: string
      /** Pedestal: dueño on-chain del token = wallet; enlace a /dashboard. */
      artifactSecuredLedgerVault: string
      /** Lectura `balance(wallet)` en contrato PHASE; `{count}` = entero. */
      artifactLedgerBalanceContract: string
      protocolStackLabel: string
      /** Subtítulo bajo saldo PHASELQ — liquidez SEP-41. */
      tokenStandardSep41Note: string
      rewardsLiquidityLaneTitle: string
      rewardsMissionChainTitle: string
      /** Botón recompensa: fase trustline Freighter (ámbar). */
      rewardsButtonEstablishingTrustline: string
      /** Botón recompensa: llamada POST /api/faucet. */
      rewardsButtonTransmittingFunds: string
      rewardsTokenTicker: string
      /** Usuario rechazó firmar changeTrust. */
      rewardsTrustlineRejectedToast: string
      /** Cuenta sin XLM / no existe en testnet. */
      rewardsTrustlineAccountMissing: string
      /** Albedo: falta permiso implícito antes del flujo automático de trustline. */
      rewardsTrustlineAlbedoImplicitRequired: string
      /** Error narrativo si el mensaje contiene "unauthorized" sin código PHASE claro. */
      biometricTrustGateClosed: string
      /** Índice 0 vacío; 1..13 = PhaseError on-chain. */
      phaseHostContractErrors: readonly string[]
      phaseHostContractUnknown: string
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
        "Each card is a PHASE collection. Mint opens the fusion chamber for that collection: pay the listed PHASELQ via initiate_phase and receive the utility NFT.",
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
      mint: "Mint NFT — pay PHASELQ",
      openChamber: "Open chamber",
      id: "ID",
      priceSuffix: "PHASELQ",
      previewPendingFusion: "[ PENDING_FUSION ]",
      previewUnverifiedCopy: "[ UNVERIFIED_COPY ]",
      previewChainVerified: "[ CHAIN_VERIFIED ]",
      back: "◄ Back",
      myArtifactsSection: "[ MY_STABILIZED_ARTIFACTS ]",
      platformListings: "[ PLATFORM_LISTINGS ]",
      sellNft: "[ SELL_NFT ]",
      sellModalTitle: "Sell / transfer NFT",
      buyerAddressLabel: "Buyer Stellar address (G…)",
      buyerHint:
        "Agree PHASELQ payment with the buyer off-wallet, then transfer the on-chain NFT here. Requires deployed contract with transfer_phase_nft.",
      listingPriceLabel: "List price (PHASELQ)",
      listingPublish: "[ PUBLISH_LISTING ]",
      listingHint: "Listing is visible on this market; payment is peer-to-peer.",
      transferNft: "[ TRANSFER_ON_CHAIN ]",
      transferBusy: "Signing…",
      cancel: "Cancel",
      close: "Close",
      cancelListing: "[ DELIST ]",
      listingLoadError: "Could not load listings.",
      transferWasmHint:
        "If simulation fails, redeploy the PHASE WASM with transfer_phase_nft and update CONTRACT_ID.",
      vaultRpcTitle: "[ PHASE_VAULT // SOROBAN_RPC ]",
      vaultRpcBlurb:
        "Your PHASE utility NFTs listed by this app via Soroban simulation (total_supply + owner_of). No third-party indexer required for this view.",
      vaultRpcLoading: "Scanning chain…",
      vaultRpcEmpty: "No PHASE NFTs found for this wallet in the scanned id range.",
      vaultRpcError: "Could not load vault (RPC or timeout). Retry later.",
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
      title: "PHASE Forge · The Oracle",
      oracleBadge: "◈ AGENT_IA // THE_ORACLE",
      market: "Market",
      chamber: "Chamber",
      intro:
        "The Oracle compiles your anomaly into solid-state art + SEP-20 lore. x402 settlement in PHASELQ unlocks the model; then the protocol mints your collection on-chain.",
      anomalyLabel: "[ ENTER_ANOMALY_DESCRIPTION ]",
      collectionName: "Collection name",
      fusionPrice: "Fusion price (PHASELQ)",
      readout: "READOUT",
      linkWallet: "Link wallet",
      linking: "Linking…",
      walletLabel: "Wallet",
      initiateAgent: "[ INITIATE_AGENT_PROTOCOL // x402_PAYMENT_REQUIRED ]",
      forgeCollection: "Forge new collection",
      deploying: "Deploying on-chain…",
      disconnect: "Disconnect",
      artPreview: "Art preview",
      lorePreview: "ARTIFACT_LORE // SEP-20",
      awaitingFeed: "AWAITING_ORACLE_SIGNAL",
      oracleHint:
        "Describe the artifact to forge. Payment opens in your wallet when the server returns 402. Establish the PHASELQ trustline (section below) first if you have not yet.",
      collectionLive: "Collection live",
      magicLink: "Share link",
      copy: "Copy link",
      copied: "Copied",
      openChamber: "Open chamber",
      collectionIdLabel: "Collection ID",
      registerTitle: "PHASE FORGE — THE ORACLE",
      tabOracle: "[ ORACLE_PROTOCOL ]",
      tabManual: "[ MANUAL_OVERRIDE ]",
      manualBadge: "◈ DIRECT_UPLOAD // NO_X402",
      manualIntro:
        "Bypass the Oracle: supply your own image (file or https/ipfs URL), write lore locally, and mint the collection on Soroban in one step. No PHASELQ x402 settlement — only ledger fees.",
      manualDropLabel: "[ DROP_FILE // IMAGE ]",
      manualDropHint: "PNG · JPEG · WebP — or use URI field below",
      manualUrlLabel: "[ IMAGE_URI ]",
      manualLoreLabel: "[ MANUAL_LORE // DESCRIPTION ]",
      manualLorePlaceholder: "Your artifact lore (off-chain preview only; not written to contract metadata).",
      manualUploadMint: "[ UPLOAD_AND_MINT_ARTIFACT ]",
      manualAwaiting: "NO_ARTIFACT_SIGNAL",
      manualAwaitingHint: "Drop an image or paste https:// or ipfs://",
      uxRailStepAOracle: "1 · Oracle",
      uxRailStepAManual: "1 · Image",
      uxRailStepB: "2 · Collection · deploy",
      deployStatus: "CONTRACT_DEPLOY",
      agentDeployStatus: "ORACLE_PIPELINE",
      deployTickers: [
        "WRITING_LEDGER_ENTRY…",
        "BROADCASTING_INVOKE_HOST_FN…",
        "AWAITING_CONSENSUS…",
        "LINKING_CREATOR_ADDRESS…",
        "EMITTING_COLLECTION_CREATED…",
      ],
      agentProcessTickers: [
        "[ SYSTEM: AGENT_PROCESSING... ]",
        "[ SYSTEM: COMPILING_LORE... ]",
        "[ SYSTEM: FORGING_MATTER... ]",
      ],
      signingPayment: "[ X402 ] OPENING_FREIGHTER — PHASELQ_SETTLE…",
      paywallNegotiating: "[ X402 ] NEGOTIATING_PAYWALL…",
      trustline_section_title: "PHASER · Trustline in wallet",
      trustline_standby: "[ ESTABLISH_PHASELQ_TRUSTLINE ]",
      trustline_signing: "[ SIGN_changeTrust_IN_WALLET ]",
      trustline_syncing: "[ SYNCING_TRUSTLINE… ]",
      trustline_ready: "[ TRUSTLINE_ACTIVE ]",
      trustline_get_testnet_xlm: "[ GET_TESTNET_XLM ]",
      trustline_msg_initialized: "PHASELQ trustline is active — your wallet can hold the asset.",
      trustline_msg_empty_account: "Your testnet account is empty. Request funds from Friendbot.",
      trustline_msg_connect_wallet: "Connect your wallet first, then establish the trustline here.",
      trustline_msg_config_missing: "Classic asset is not configured in NEXT_PUBLIC_CLASSIC_LIQ_*.",
      trustline_msg_waiting_confirmation: "Trustline transaction sent. Waiting for ledger confirmation...",
      trustline_msg_protocol_ready: "Trustline ready — PHASELQ faucet and rewards can credit your account.",
      trustline_gas_label: "XLM gas",
      trustline_friendbot_link: "Friendbot ↗",
      trustline_asset_hint:
        "This control opens the PHASELQ classic trustline in whatever wallet you connected (Freighter, Albedo, xBull, …).",
      trustline_albedo_prep_title: "Albedo signing (trustline)",
      trustline_albedo_prep_body:
        "Allow signing once below so the wallet dialog is not blocked after Horizon loads. You can also use the bar at the bottom of the page.",
      trustline_albedo_prep_button: "Allow Albedo signing",
      trustline_albedo_prep_working: "Opening Albedo…",
      oracle_blocked_msg:
        "Establish the PHASELQ trustline in your wallet first (section above), then use the Oracle.",
      mint_blocked_msg:
        "Establish the PHASELQ trustline in your wallet first (section above), then mint.",
      ipfsOracleHint:
        "Tip: configure PINATA_JWT on the server so long image URLs (e.g. Pollinations) are sealed to ipfs:// before mint (256-char on-chain limit).",
      errors: {
        connectWallet: "Connect your wallet first.",
        nameShort: "Collection name is too short (min. 2 characters).",
        priceInvalid: "Invalid PHASELQ price.",
        collectionIdRead: "Could not read collection_id on-chain.",
        creatorAlreadyHasCollection: "This wallet already has a collection (#{id}). Open the chamber for that collection instead of creating a new one.",
        clipboard: "Could not copy to clipboard.",
        anomalyShort: "Anomaly description is too short (min. 4 characters).",
        agentRequest: "Oracle request failed.",
        agentPay: "Settlement transaction failed or was rejected.",
        agentNot402: "Unexpected response from forge-agent (expected 402 then paid run).",
        fetchAgentImage: "Could not download generated image for mint.",
        finalUri: "Could not produce a valid on-chain image URI (try enabling IPFS upload).",
        lowEnergyAgent: "Insufficient PHASELQ for Oracle x402 settlement (see balance).",
        rpcBalanceCheckFailed:
          "Could not read your PHASELQ balance (Soroban RPC timed out or errored). Wait a few seconds and try again, or set STELLAR_RPC_FALLBACK_URLS in .env.local.",
        sorobanTestnetCongested:
          "Stellar Testnet is congested (HTTP 503). Please retry in a few seconds.",
        freighterWrongNetwork:
          "Freighter is not on Stellar testnet (current: {network}). Switch network in Freighter to Testnet, then retry.",
        manualNoImage: "Provide an image file or a valid https:// or ipfs:// URL.",
        userAbortedFreighter: "Payment cancelled in Freighter (x402 PHASELQ settle was not signed).",
        oracleOfflineAfterPayment:
          "On-chain settlement likely succeeded, but the Oracle step failed (often Gemini: missing key, quota, or model). PHASELQ was debited. Fix GEMINI_API_KEY / GEMINI_MODEL on the server, check logs, then retry — or use Manual forge without another settle.",
        fusionChamberHalted:
          "[ PROTOCOL_HALTED: ERROR_IN_FUSION_CHAMBER ] — Check PHASELQ balance, contract IDs, IPFS config, and the browser console for the underlying error.",
        phaseHostContractErrors: PHASE_HOST_CONTRACT_ERRORS_EN,
        phaseHostContractUnknown: PHASE_HOST_CONTRACT_UNKNOWN_EN,
      },
      placeholders: {
        collectionName: "Crypto-Art 2026",
        price: "5.0",
        anomaly: "Describe the artifact to forge…",
        manualImageUrl: "https://… or ipfs://…",
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
      liqBalance: "PHASELQ_BALANCE",
      liqBalanceIssuerMismatch:
        "Also held as PHASELQ elsewhere: {total} — only the balance above is spendable for settlement on this protocol deployment.",
      collectionId: "Collection_ID",
      collectionIdProtocol: "0 (protocol)",
      x402Price: "X402_Price",
      network: "Network",
      networkValue: "SOROBAN_TESTNET",
      signalLabel: "SIGNAL",
      classicAssetLabel: "CLASSIC_ASSET",
      freighterBalanceLabel: "FREIGHTER_BALANCE",
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
      reactorClaimNftCta: "[ ◈ CLAIM_NFT_TO_WALLET ]",
      reactorNftSecuredHint: "UTILITY_NFT_IN_WALLET — USE_DASHBOARD_OR_FREIGHTER_TO_PIN",
      reactorClaimUnavailableHint:
        "NFT_ON_CHAIN_BUT_NOT_CLAIMABLE_HERE — HOLDER_IS_NOT_ISSUER_CUSTODY",
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
      faucetButton: "[ ⚡ RECHARGE_PHASELQ ]",
      rewardsSectionTitle: "[ LIQ_REWARDS ]",
      collectInfoPanelTitle: "COLLECT // LIQUIDITY + NFT",
      reactorQuestsSectionTitle: "OPERATOR_QUESTS // REACTOR_LANE",
      rewardsHelpAria: "Help: PHASELQ and reward programs",
      rewardsHelpClose: "Close",
      rewardsHelpModalTitle: "PHASELQ & rewards",
      rewardsHelpLiqTitle: "What is LIQ?",
      rewardsHelpLiqBody:
        "LIQ is the short name we show in the UI for PHASELQ, the Soroban testnet utility token for PHASE. You use it to pay mint prices (initiate_phase / x402 settlement) and to experiment with the reactor. Balances use seven decimals like other Stellar assets. This is testnet liquidity—not real money.",
      rewardsHelpQuestsTitle: "Genesis, daily, and quests",
      rewardsHelpQuestsBody:
        "Genesis is a one-time starting grant for new wallets. Daily recharge refills on a 24-hour timer. Quests are one-time missions (connect wallet, forge a collection, complete a settlement). Progress bars show eligibility; Claim requests a server-signed mint when requirements are met.",
      rewardsQuestProgress: "QUEST PROGRESS",
      rewardsNftInWalletTitle: "[ ACTIVELY CUSTODIED IN YOUR WALLET ]",
      rewardsNftStellarExpertLink: "[ VIEW ON STELLAR EXPERT ]",
      rewardsNftCollectPanelTitle: "COLLECT · UTILITY NFT (SEP-20)",
      rewardsNftCollectPanelBody:
        "Token #{tokenId}: the NFT is held by the classic PHASELQ issuer ({issuerShort}…). Collect sends transfer(issuer → your wallet), signed by the server — no wallet signature needed. Works with Albedo, Freighter, xBull, etc.",
      rewardsNftNotIssuerCustodyBody:
        "Token #{tokenId}: on-chain owner is not the PHASELQ issuer; server Collect does not apply. Use your wallet’s “add NFT manually” (contract address + Token ID) if your app supports it.",
      rewardsNftCollectButton: "COLLECT",
      rewardsNftCollectSending: "SENDING…",
      rewardsNftCollectVerifying: "[ VERIFYING_NFT_ON_LEDGER… ]",
      rewardsNftCollectVerifyFailed: "[ COLLECT · LEDGER CHECK FAILED ]",
      pedestalIssuerCustodyHint:
        "Utility NFT is still in issuer custody. Use COLLECT in the right-hand panel (server-signed transfer to your connected wallet).",
      pedestalIssuerCustodyScrollLink: "Jump to COLLECT panel ↓",
      walletNftVisibilityTitle: "NFT NOT SHOWING IN YOUR WALLET?",
      walletNftVisibilityBody:
        "If your transaction history shows a successful settlement (invoke settle → true), the protocol already minted your NFT on-chain—that is the proof. Many wallets show Soroban transactions in history but do not display SEP-20 NFTs in the main balance view. This does not mean the NFT is lost.\n\n• Your PHASE utility NFT lives on testnet: verified by owner_of = your address on the PHASE contract.\n• Tap COPY · CONTRACT + TOKEN ID below to paste into your wallet's \"add NFT manually\" (works with Freighter, Albedo, xBull, etc.).\n• PHASE Dashboard → Vault scans Soroban RPC and lists every PHASE NFT for your wallet (source of truth).\n• Stellar Expert (contract link) helps verify owner_of, token_uri, and transfers on-chain.",
      creatorCanMint: "CREATOR_MINT_ENABLED",
      creatorMintRule: "Creator can mint this collection too (one utility NFT per wallet per collection).",
      creatorAlreadyMinted: "Creator already minted this collection with this wallet.",
      freighterManualAddTitle: "SOROBAN_NFT · MANUAL_ADD (ANY_WALLET)",
      freighterManualAddBody:
        "If it does not appear in your wallet UI: look for “add NFT / Soroban contract” (Albedo builds vary) or use Freighter Collectibles → Add manually.",
      freighterManualAddTroubleshoot:
        "Freighter’s Collectibles flow may rely on its own backend or a public indexer — independent from this app. If Add manually fails, use “Ping Freighter index” below (no-op self-transfer, emits a standard transfer event), wait, then retry. In PHASE, your authoritative list is the dashboard vault (Soroban RPC scan) — no Mercury subscription required for that.",
      freighterIndexPingButton: "[ PING FREIGHTER INDEX · SELF-TRANSFER ]",
      freighterIndexPingToastOk: "Index ping submitted. Wait 1–5 min, then Add Collectible in Freighter again.",
      freighterIndexPingToastFail: "Index ping failed. Check network or try again.",
      freighterSep50CheckButton: "[ CHECK SEP-50 / FREIGHTER READINESS ]",
      freighterSep50CheckIntro:
        "Runs on our server: Soroban name(), symbol(), owner_of, token_uri, then fetches metadata JSON. Freighter still uses its own indexer for auto-list — this only proves the contract + URL match the SEP-0050 draft.",
      freighterSep50CheckFailToast: "SEP-50 check request failed.",
      freighterOwnerOnChainAddBody:
        "You already own this NFT on the PHASE contract. Albedo often shows nothing here even though the ledger does—use COPY below + Dashboard vault. Freighter: Collectibles → Add manually with the same C… + Token ID (testnet).",
      onChainMetaNftContractLabel: "NFT_PROTOCOL_CONTRACT",
      onChainMetaPhaselqSacLabel: "PHASELQ_SAC (fungible)",
      freighterCopyBundleButton: "[ COPY · C… CONTRACT + TOKEN ID ]",
      freighterCopyBundleToast:
        "Copied 2 lines: (1) PHASE NFT contract C…, (2) numeric Token ID. Paste into your wallet’s manual add (Albedo / Freighter / etc.) or keep for Lab.",
      artifactSecuredLedgerVault: "[ ARTIFACT SECURED IN LEDGER // VIEW IN PHASE VAULT ]",
      artifactLedgerBalanceContract: "CONTRACT balance() · {count} utility NFT(s) attributed to this wallet",
      protocolStackLabel:
        "x402 · PHASELQ = Soroban fungible (SEP-41) · forged artifact = immutable utility NFT (metadata SEP-20)",
      tokenStandardSep41Note: "PHASELQ adheres to SEP-41 (Soroban token interface).",
      rewardsLiquidityLaneTitle: "LIQUIDITY_BOOTSTRAP",
      rewardsMissionChainTitle: "OPERATOR_QUEST_CHAIN",
      rewardsButtonEstablishingTrustline: "[ ESTABLISHING_TRUSTLINE... ]",
      rewardsButtonTransmittingFunds: "[ TRANSMITTING_FUNDS... ]",
      rewardsTokenTicker: "LIQ",
      rewardsTrustlineRejectedToast: "[ TRUSTLINE_REQUIRED_TO_RECEIVE_FUNDS ] Approve changeTrust in your wallet.",
      rewardsTrustlineAccountMissing:
        "Stellar account not on testnet or unfunded. Add test XLM (Friendbot) before claiming PHASELQ.",
      rewardsTrustlineAlbedoImplicitRequired:
        "Albedo: allow signing first (bottom bar or Forge trustline card), then claim again.",
      biometricTrustGateClosed: "[ ERROR: BIOMETRIC_TRUST_GATE_CLOSED ]",
      phaseHostContractErrors: PHASE_HOST_CONTRACT_ERRORS_EN,
      phaseHostContractUnknown: PHASE_HOST_CONTRACT_UNKNOWN_EN,
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
        walletKitPickerForSettle:
          "[ WALLET_KIT ] OPENING_MODAL · CHOOSE_WALLET_TO_SIGN_AND_RECEIVE_NFT…",
        walletKitPickerDismissed: "[ WALLET_KIT ] MODAL_CLOSED — SETTLEMENT_ABORTED",
        receivingChallenge: "[ RECEIVING_CHALLENGE... ]",
        signingAuth: "[ SIGNING_AUTH_ENTRY... ]",
        settlingPayment: "[ SETTLING_PAYMENT... ]",
        decrypting: "[ DECRYPTING_PROTECTED_DATA... ]",
        x402Ok: "[ X402_PIPELINE_OK ] ENERGY_ROUTED",
        forgedOnSettle: "[ PHASE_NFT_FORGED_ON_SETTLE ] CHECK_PEDESTAL",
        faucetEmitting: "[ EMITTING_PHASELQ_FOR_OPERATOR... ]",
        faucetLoadingSupply: "[ LOADING_SUPPLY... ]",
        faucetOk: "[ PHASELQ_MINT_CONFIRMED ] BALANCE_REFRESHED",
        faucetReceived: "[ +{amount} PHASELQ RECEIVED ]",
        faucetFailPrefix: "[ FAUCET_FAULT ]",
        genesisSupplyRequested: "[ SOLICITANDO_ENERGÍA_AL_NÚCLEO... ]",
        genesisTransferComplete: "[ GENESIS_SUPPLY_TRANSFER_OK ] REACTOR_CHARGED",
        classicTrustlineEstablishing: "[ CLASSIC_PHASELQ ] CHECKING_TRUSTLINE_FOR_REWARD...",
        classicTrustlineFreighter: "[ WALLET ] AWAITING_changeTrust_SIGNATURE...",
        classicTrustlineConfirmed: "[ TRUSTLINE_OK ] CLASSIC_ASSET_LINE_READY",
        classicTrustlineRejected: "[ TRUSTLINE_DENIED ] OPERATOR_ABORT",
        classicTrustlineAccountMissing: "[ ACCOUNT_MISSING ] FUND_TESTNET_XLM_FIRST",
      },
      artifact: {
        registeredDefault: "PHASE_UTILITY_ARTIFACT // REGISTERED",
        owner: "OWNER",
        serial: "SERIAL",
        powerLevel: "POWER_LEVEL",
        readonly: "[ SMART_ASSET_VIEW // READ_ONLY ]",
        noVisual: "[ NO_VISUAL_CHANNEL ]",
        ariaLabel: "Phase utility NFT artifact",
        sepSuffix: "// SEP-20",
        dataLocked: "[ DATA_LOCKED ]",
        contract: "CONTRACT",
        terminalRestricted: "TERMINAL_LOCKED // CLASSIFIED",
        systemActive: "SYSTEM_ACTIVE // OWNERSHIP_VERIFIED",
        verifying: "[ VERIFYING_CHAIN… ]",
        downloadCertificate: "[ DOWNLOAD_CERTIFICATE ]",
        expandPreview: "EXPAND_VIEW // FULL_RES",
        closePreview: "[ CLOSE ]",
        unverifiedCopy: "[ UNVERIFIED_COPY ]",
        authenticitySealVerified: "✦ ON_CHAIN #{token} · VIEWER_SIG:{sig}",
        accessDeniedLine: "SCREENSHOT ≠ LEDGER_KEY — REACTOR_LOCKED",
        stateLiquid: "LIQUID",
        stateSolid: "SOLID",
        accessPrivateMetadata: "[ ACCESS_PRIVATE_METADATA ]",
        privateChannelUnlocked: "PRIVATE_METADATA_CHANNEL // UNLOCKED",
        metadataStandard: "METADATA_STANDARD",
        previewOnly: "[ PREVIEW_ONLY ]",
        decryptingImage: "[ DECRYPTING_IMAGE ]",
        monitorCollectionName: "COLLECTION_NAME",
        monitorContractAddr: "CONTRACT_ADDR",
        supplyStabilized: "SUPPLY_STABILIZED",
        secretId: "SECRET_ID",
        holderSignature: "HOLDER_SIGNATURE",
        rawMetadata: "RAW_METADATA",
        pendingOwnershipVerification: "[ PENDING_OWNERSHIP_VERIFICATION ]",
        imageLoadHint:
          "The preview URL did not load (blocked, slow IPFS gateway, or bad link). Open the URL in a new tab or try another gateway.",
        openImageUrl: "Open image URL",
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
        "Cada tarjeta es una colección PHASE. Mint abre la cámara de fusión: pagas el PHASELQ indicado con initiate_phase y recibes el NFT de utilidad.",
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
      mint: "Acuñar NFT — pagar PHASELQ",
      openChamber: "Abrir cámara",
      id: "ID",
      priceSuffix: "PHASELQ",
      previewPendingFusion: "[ PENDING_FUSION ]",
      previewUnverifiedCopy: "[ COPIA_NO_VERIFICADA ]",
      previewChainVerified: "[ VERIFICADO_EN_CADENA ]",
      back: "◄ Volver",
      myArtifactsSection: "[ MIS_ARTEFACTOS_ESTABILIZADOS ]",
      platformListings: "[ ANUNCIOS_EN_LA_PLATAFORMA ]",
      sellNft: "[ VENDER_NFT ]",
      sellModalTitle: "Vender / transferir NFT",
      buyerAddressLabel: "Dirección Stellar del comprador (G…)",
      buyerHint:
        "Acordá el pago en PHASELQ con el comprador (transferencia directa), luego transferí el NFT on-chain aquí. Requiere contrato PHASE con transfer_phase_nft desplegado.",
      listingPriceLabel: "Precio de venta (PHASELQ)",
      listingPublish: "[ PUBLICAR_ANUNCIO ]",
      listingHint: "El anuncio se ve en este mercado; el cobro es P2P entre wallets.",
      transferNft: "[ TRANSFERIR_ON_CHAIN ]",
      transferBusy: "Firmando…",
      cancel: "Cancelar",
      close: "Cerrar",
      cancelListing: "[ QUITAR_ANUNCIO ]",
      listingLoadError: "No se pudieron cargar los anuncios.",
      transferWasmHint:
        "Si falla la simulación, redesplegá el WASM PHASE con transfer_phase_nft y actualizá CONTRACT_ID.",
      vaultRpcTitle: "[ BÓVEDA_PHASE // RPC_SOROBAN ]",
      vaultRpcBlurb:
        "Tus NFT de utilidad PHASE listados por esta app vía simulación Soroban (total_supply + owner_of). Esta vista no depende de un indexador de terceros.",
      vaultRpcLoading: "Escaneando cadena…",
      vaultRpcEmpty: "No se encontraron NFT PHASE para esta wallet en el rango escaneado.",
      vaultRpcError: "No se pudo cargar la bóveda (RPC o tiempo de espera). Reintentá más tarde.",
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
      title: "PHASE Forja · El Oráculo",
      oracleBadge: "◈ AGENTE_IA // EL_ORÁCULO",
      market: "Mercado",
      chamber: "Cámara",
      intro:
        "El Oráculo compila tu anomalía en arte de estado sólido + lore SEP-20. La liquidación x402 en PHASELQ desbloquea el modelo; luego el protocolo acuña tu colección on-chain.",
      anomalyLabel: "[ ENTER_ANOMALY_DESCRIPTION ]",
      collectionName: "Nombre de colección",
      fusionPrice: "Precio de fusión (PHASELQ)",
      readout: "LECTURA",
      linkWallet: "Vincular wallet",
      linking: "Vinculando…",
      walletLabel: "Wallet",
      initiateAgent: "[ INITIATE_AGENT_PROTOCOL // x402_PAYMENT_REQUIRED ]",
      forgeCollection: "Forjar colección nueva",
      deploying: "Desplegando on-chain…",
      disconnect: "Desconectar",
      artPreview: "Vista previa",
      lorePreview: "LORE_ARTEFACTO // SEP-20",
      awaitingFeed: "ESPERANDO_SEÑAL_ORÁCULO",
      oracleHint:
        "Describe el artefacto a forjar. El pago se abre en tu wallet cuando el servidor responde 402. Establecé antes la trustline PHASELQ (bloque de abajo) si aún no lo hiciste.",
      collectionLive: "Colección en vivo",
      magicLink: "Enlace para compartir",
      copy: "Copiar enlace",
      copied: "Copiado",
      openChamber: "Abrir cámara",
      collectionIdLabel: "ID de colección",
      registerTitle: "PHASE FORGE — THE ORACLE",
      tabOracle: "[ ORACLE_PROTOCOL ]",
      tabManual: "[ MANUAL_OVERRIDE ]",
      manualBadge: "◈ CARGA_DIRECTA // SIN_X402",
      manualIntro:
        "Sin Oráculo: aportás imagen (archivo o URL https/ipfs), escribís el lore en local y acuñás la colección en Soroban en un paso. Sin liquidación x402 en PHASELQ — solo fees de red.",
      manualDropLabel: "[ SOLTAR_ARCHIVO // IMAGEN ]",
      manualDropHint: "PNG · JPEG · WebP — o usá el campo URI abajo",
      manualUrlLabel: "[ URI_IMAGEN ]",
      manualLoreLabel: "[ LORE_MANUAL // DESCRIPCIÓN ]",
      manualLorePlaceholder: "Lore del artefacto (solo vista previa; no se escribe en metadatos del contrato).",
      manualUploadMint: "[ UPLOAD_AND_MINT_ARTIFACT ]",
      manualAwaiting: "SIN_SEÑAL_ARTEFACTO",
      manualAwaitingHint: "Soltá una imagen o pegá https:// o ipfs://",
      uxRailStepAOracle: "1 · Oráculo",
      uxRailStepAManual: "1 · Imagen",
      uxRailStepB: "2 · Colección · despliegue",
      deployStatus: "DESPLIEGUE_CONTRATO",
      agentDeployStatus: "TUBERÍA_ORÁCULO",
      deployTickers: [
        "ESCRIBIENDO_ENTRADA_LEDGER…",
        "DIFUSIÓN_INVOKE_HOST_FN…",
        "ESPERANDO_CONSENSO…",
        "ENLACE_DIRECCIÓN_CREADOR…",
        "EMITIENDO_COLLECTION_CREATED…",
      ],
      agentProcessTickers: [
        "[ SYSTEM: AGENT_PROCESSING... ]",
        "[ SYSTEM: COMPILING_LORE... ]",
        "[ SYSTEM: FORGING_MATTER... ]",
      ],
      signingPayment: "[ X402 ] ABRIENDO_FREIGHTER — SETTLE_PHASELQ…",
      paywallNegotiating: "[ X402 ] NEGOCIANDO_PAYWALL…",
      trustline_section_title: "PHASER · Trustline en la wallet",
      trustline_standby: "[ ABRIR_TRUSTLINE_PHASELQ ]",
      trustline_signing: "[ FIRMANDO_changeTrust_EN_WALLET ]",
      trustline_syncing: "[ SINCRONIZANDO_TRUSTLINE… ]",
      trustline_ready: "[ TRUSTLINE_ACTIVA ]",
      trustline_get_testnet_xlm: "[ GET_TESTNET_XLM ]",
      trustline_msg_initialized: "Trustline PHASELQ activa — tu wallet ya puede tener el asset.",
      trustline_msg_empty_account: "Tu cuenta de Testnet está vacía. Pide fondos al Friendbot.",
      trustline_msg_connect_wallet: "Conectá tu wallet primero y establecé la trustline acá.",
      trustline_msg_config_missing: "El asset clásico no está configurado en NEXT_PUBLIC_CLASSIC_LIQ_*.",
      trustline_msg_waiting_confirmation: "Transacción de trustline enviada. Esperando confirmación en ledger...",
      trustline_msg_protocol_ready: "Trustline lista — el faucet y las recompensas pueden acreditarte PHASELQ.",
      trustline_gas_label: "Gas XLM",
      trustline_friendbot_link: "Friendbot ↗",
      trustline_asset_hint:
        "Este bloque abre la trustline clásica PHASELQ en la wallet que tengas conectada (Freighter, Albedo, xBull…).",
      trustline_albedo_prep_title: "Albedo y trustline",
      trustline_albedo_prep_body:
        "Concedé permiso de firma una vez (botón de abajo) para que el navegador no bloquee el diálogo tras cargar Horizon. También podés usar la barra inferior de la página.",
      trustline_albedo_prep_button: "Permitir firma con Albedo",
      trustline_albedo_prep_working: "Abriendo Albedo…",
      oracle_blocked_msg:
        "Primero establecé la trustline PHASELQ en tu wallet (sección de arriba), después usá el Oráculo.",
      mint_blocked_msg:
        "Primero establecé la trustline PHASELQ en tu wallet (sección de arriba), después minteá.",
      ipfsOracleHint:
        "Tip: configurá PINATA_JWT en el servidor para sellar URLs largas de imagen (p. ej. Pollinations) a ipfs:// antes del mint (límite 256 caracteres on-chain).",
      errors: {
        connectWallet: "Conecta la wallet primero.",
        nameShort: "Nombre de colección demasiado corto (mín. 2 caracteres).",
        priceInvalid: "Precio PHASELQ inválido.",
        collectionIdRead: "No se pudo leer collection_id on-chain.",
        creatorAlreadyHasCollection: "Esta wallet ya tiene una colección (#{id}). Abre la cámara de esa colección en lugar de crear otra.",
        clipboard: "No se pudo copiar al portapapeles.",
        anomalyShort: "La descripción de la anomalía es demasiado corta (mín. 4 caracteres).",
        agentRequest: "Falló la petición al Oráculo.",
        agentPay: "La transacción de liquidación falló o fue rechazada.",
        agentNot402: "Respuesta inesperada de forge-agent (se esperaba 402 y luego ejecución pagada).",
        fetchAgentImage: "No se pudo descargar la imagen generada para el mint.",
        finalUri: "No se pudo obtener una URI de imagen válida on-chain (probá habilitar subida IPFS).",
        lowEnergyAgent: "PHASELQ insuficiente para la liquidación x402 del Oráculo (revisá el saldo).",
        rpcBalanceCheckFailed:
          "No se pudo leer tu saldo PHASELQ (el RPC Soroban falló o hizo timeout). Esperá unos segundos y reintentá, o configurá STELLAR_RPC_FALLBACK_URLS en .env.local.",
        sorobanTestnetCongested:
          "La red de Stellar Testnet está congestionada (Error 503). Por favor, reintenta en unos segundos.",
        freighterWrongNetwork:
          "Freighter no está en Stellar testnet (red actual: {network}). Cambiá a Testnet en Freighter y reintentá.",
        manualNoImage: "Necesitás un archivo de imagen o una URL https:// o ipfs:// válida.",
        userAbortedFreighter: "Pago cancelado en Freighter (no se firmó el settle x402 en PHASELQ).",
        oracleOfflineAfterPayment:
          "La liquidación on-chain probablemente se confirmó, pero falló el paso del Oráculo (suele ser Gemini: clave, cuota o modelo). El PHASELQ ya se debitó. Revisá GEMINI_API_KEY / GEMINI_MODEL y los logs del servidor, reintentá, o usá Forja manual sin otro settle.",
        fusionChamberHalted:
          "[ PROTOCOL_HALTED: ERROR_IN_FUSION_CHAMBER ] — Revisá saldo PHASELQ, IDs de contrato, configuración IPFS y la consola del navegador para el error concreto.",
        phaseHostContractErrors: PHASE_HOST_CONTRACT_ERRORS_ES,
        phaseHostContractUnknown: PHASE_HOST_CONTRACT_UNKNOWN_ES,
      },
      placeholders: {
        collectionName: "Cripto-Arte 2026",
        price: "5.0",
        anomaly: "Describe el artefacto a forjar…",
        manualImageUrl: "https://… o ipfs://…",
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
      liqBalance: "SALDO_PHASELQ",
      liqBalanceIssuerMismatch:
        "PHASELQ en otras líneas / emisores: {total} — para liquidar aquí solo cuenta el saldo de arriba (SAC del protocolo).",
      collectionId: "ID_Colección",
      collectionIdProtocol: "0 (protocolo)",
      x402Price: "Precio_X402",
      network: "Red",
      networkValue: "SOROBAN_TESTNET",
      signalLabel: "SEÑAL",
      classicAssetLabel: "ASSET_CLÁSICO",
      freighterBalanceLabel: "SALDO_FREIGHTER",
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
      reactorClaimNftCta: "[ ◈ RECOGER_NFT_EN_MI_WALLET ]",
      reactorNftSecuredHint: "NFT_UTILIDAD_EN_TU_WALLET — USÁ_DASHBOARD_O_FREIGHTER_PARA_FIJAR",
      reactorClaimUnavailableHint:
        "NFT_EN_CADENA_PERO_NO_RECOGIBLE_AQUÍ — EL_TITULAR_NO_ES_LA_CUSTODIA_DEL_EMISOR",
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
      faucetButton: "[ ⚡ SOLICITAR_PHASELQ ]",
      rewardsSectionTitle: "[ RECOMPENSAS_LIQ ]",
      collectInfoPanelTitle: "COLECTAR // LIQUIDEZ + NFT",
      reactorQuestsSectionTitle: "QUESTS_OPERADOR // CARRIL_REACTOR",
      rewardsHelpAria: "Ayuda: PHASELQ y recompensas",
      rewardsHelpClose: "Cerrar",
      rewardsHelpModalTitle: "PHASELQ y recompensas",
      rewardsHelpLiqTitle: "¿Qué es LIQ?",
      rewardsHelpLiqBody:
        "LIQ es la etiqueta corta que ves en la interfaz para PHASELQ, el token de utilidad Soroban en testnet de PHASE. Sirve para pagar precios de mint (initiate_phase / liquidación x402) y para probar el reactor. Los saldos usan siete decimales como otros assets Stellar. Es liquidez de testnet, no dinero real.",
      rewardsHelpQuestsTitle: "Genesis, diaria y misiones",
      rewardsHelpQuestsBody:
        "Genesis es un fondo inicial único para wallets nuevas. La recarga diaria se reinicia cada 24 horas. Las quests son misiones de una sola vez (vincular wallet, crear colección, completar una liquidación). Las barras muestran el avance; Reclamar pide un mint firmado por el servidor cuando cumples los requisitos.",
      rewardsQuestProgress: "PROGRESO QUESTS",
      rewardsNftInWalletTitle: "[ ACTIVAMENTE CUSTODIADO EN TU BILLETERA ]",
      rewardsNftStellarExpertLink: "[ VER EN STELLAR EXPERT ]",
      rewardsNftCollectPanelTitle: "COLECTAR · NFT DE UTILIDAD (SEP-20)",
      rewardsNftCollectPanelBody:
        "Token #{tokenId}: el NFT está en custodia del emisor clásico PHASELQ ({issuerShort}…). Colectar envía transfer(emisor → tu wallet) firmado por el servidor — no hace falta firmar en la wallet. Sirve con Albedo, Freighter, xBull, etc.",
      rewardsNftNotIssuerCustodyBody:
        "Token #{tokenId}: el owner on-chain no es el emisor PHASELQ; el colectar del servidor no aplica. Usá “añadir NFT manual” en tu wallet (dirección del contrato + Token ID) si la app lo permite.",
      rewardsNftCollectButton: "COLECTAR",
      rewardsNftCollectSending: "ENVIANDO…",
      rewardsNftCollectVerifying: "[ VERIFICANDO_NFT_EN_LEDGER… ]",
      rewardsNftCollectVerifyFailed: "[ COLECTAR · FALLO AL VERIFICAR LEDGER ]",
      pedestalIssuerCustodyHint:
        "El NFT de utilidad sigue en custodia del emisor. Usá COLECTAR en el panel derecho (transfer firmado por el servidor a tu wallet conectada).",
      pedestalIssuerCustodyScrollLink: "Ir al panel COLECTAR ↓",
      walletNftVisibilityTitle: "¿NO VES EL NFT EN TU WALLET?",
      walletNftVisibilityBody:
        "Si tu historial de transacciones muestra un settlement exitoso (invoke settle → true), el protocolo ya minteó tu NFT en el ledger—esa es la prueba. Muchas wallets muestran transacciones Soroban en el historial pero no exhiben NFTs SEP-20 en la vista principal de balance. Esto no significa que el NFT se haya perdido.\n\n• Tu NFT de utilidad PHASE vive en testnet: verificado por owner_of = tu dirección en el contrato PHASE.\n• Tocá COPIAR · CONTRATO + ID abajo para pegar en \"añadir NFT manualmente\" de tu wallet (funciona con Freighter, Albedo, xBull, etc.).\n• **Dashboard PHASE → Bóveda** escanea RPC Soroban y lista todos los NFT PHASE de tu wallet (fuente de verdad).\n• **Stellar Expert** sirve para verificar owner_of, token_uri y transferencias on-chain.",
      creatorCanMint: "CREADOR_MINT_HABILITADO",
      creatorMintRule: "El creador también puede mintear esta colección (1 NFT de utilidad por wallet por colección).",
      creatorAlreadyMinted: "El creador ya minteó esta colección con esta wallet.",
      freighterManualAddTitle: "NFT_SOROBAN · AÑADIR_MANUAL (CUALQUIER_WALLET)",
      freighterManualAddBody:
        "Si no aparece en la UI de tu wallet: buscá “añadir NFT / contrato Soroban” (según versión de Albedo) o Freighter → Collectibles → Add manually.",
      freighterManualAddTroubleshoot:
        "El flujo Collectibles de Freighter puede depender de su propio backend o de un indexador público — ajeno a esta app. Si Add manually falla, usá “Ping índice Freighter” abajo (self-transfer sin efecto, emite evento transfer estándar), esperá y reintentá. En PHASE, la lista autoritativa es la bóveda del dashboard (escaneo RPC Soroban) — no hace falta suscripción a Mercury para eso.",
      freighterIndexPingButton: "[ PING ÍNDICE FREIGHTER · AUTO-TRANSFER ]",
      freighterIndexPingToastOk: "Ping al índice enviado. Esperá 1–5 min y volvé a Add Collectible en Freighter.",
      freighterIndexPingToastFail: "Falló el ping al índice. Revisá la red o reintentá.",
      freighterSep50CheckButton: "[ COMPROBAR SEP-50 / FREIGHTER ]",
      freighterSep50CheckIntro:
        "Se ejecuta en nuestro servidor: name(), symbol(), owner_of, token_uri en Soroban y luego el GET del JSON. Freighter sigue usando su propio backend para auto-listar — esto solo confirma que el contrato y la URL encajan con el borrador SEP-0050.",
      freighterSep50CheckFailToast: "Falló la petición de comprobación SEP-50.",
      freighterOwnerOnChainAddBody:
        "Ya sos dueño on-chain del NFT en el contrato PHASE. Albedo suele no mostrarlo aunque el ledger sí: usá COPIAR abajo y la bóveda del Dashboard. En Freighter: Collectibles → Add manually con el mismo C… + Token ID (testnet).",
      onChainMetaNftContractLabel: "CONTRATO_NFT_PHASE",
      onChainMetaPhaselqSacLabel: "PHASELQ_SAC (fungible)",
      freighterCopyBundleButton: "[ COPIAR · CONTRATO C… + ID ]",
      freighterCopyBundleToast:
        "Copiado en 2 líneas: (1) contrato C… del NFT PHASE, (2) Token ID numérico (sin #). Pegá en tu wallet (Albedo / Freighter / etc.) o guardalo para Lab.",
      artifactSecuredLedgerVault: "[ ARTEFACTO ASEGURADO EN LEDGER // VER EN BÓVEDA PHASE ]",
      artifactLedgerBalanceContract: "CONTRACT balance() · {count} NFT(s) de utilidad atribuidos a esta wallet",
      protocolStackLabel:
        "x402 · PHASELQ = fungible Soroban (SEP-41) · artefacto forjado = NFT de utilidad inmutable (metadata SEP-20)",
      tokenStandardSep41Note: "PHASELQ cumple SEP-41 (interfaz de token Soroban).",
      rewardsLiquidityLaneTitle: "ARRANQUE_LIQUIDEZ",
      rewardsMissionChainTitle: "CADENA_MISIONES_OPERADOR",
      rewardsButtonEstablishingTrustline: "[ ESTABLECIENDO_TRUSTLINE... ]",
      rewardsButtonTransmittingFunds: "[ TRANSMITIENDO_FONDOS... ]",
      rewardsTokenTicker: "LIQ",
      rewardsTrustlineRejectedToast:
        "[ TRUSTLINE_REQUERIDA_PARA_RECIBIR ] Aprobá changeTrust en tu wallet.",
      rewardsTrustlineAccountMissing:
        "La cuenta no está en testnet o sin XLM. Añadí XLM de prueba (Friendbot) antes de reclamar PHASELQ.",
      rewardsTrustlineAlbedoImplicitRequired:
        "Albedo: primero concedé permiso de firma (barra inferior o tarjeta trustline en Forge) y volvé a reclamar.",
      biometricTrustGateClosed: "[ ERROR: BIOMETRIC_TRUST_GATE_CLOSED ]",
      phaseHostContractErrors: PHASE_HOST_CONTRACT_ERRORS_ES,
      phaseHostContractUnknown: PHASE_HOST_CONTRACT_UNKNOWN_ES,
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
        walletKitPickerForSettle:
          "[ WALLET_KIT ] ABRIENDO_MODAL · ELEGÍ_WALLET_PARA_FIRMAR_Y_RECIBIR_NFT…",
        walletKitPickerDismissed: "[ WALLET_KIT ] MODAL_CERRADO — SETTLEMENT_ABORTADO",
        receivingChallenge: "[ RECIBIENDO_DESAFÍO... ]",
        signingAuth: "[ FIRMANDO_ENTRADA_AUTH... ]",
        settlingPayment: "[ LIQUIDANDO_PAGO... ]",
        decrypting: "[ DESCIFRANDO_DATOS_PROTEGIDOS... ]",
        x402Ok: "[ X402_PIPELINE_OK ] ENERGÍA_ENRUTADA",
        forgedOnSettle: "[ NFT_FASE_FORJADO_AL_LIQUIDAR ] REVISAR_PEDESTAL",
        faucetEmitting: "[ EMITIENDO_PHASELQ_PARA_OPERADOR... ]",
        faucetLoadingSupply: "[ SUMINISTRO_EN_CURSO... ]",
        faucetOk: "[ PHASELQ_MINT_CONFIRMADO ] SALDO_ACTUALIZADO",
        faucetReceived: "[ +{amount} PHASELQ RECIBIDOS ]",
        faucetFailPrefix: "[ FALLO_FAUCET ]",
        genesisSupplyRequested: "[ SOLICITANDO_ENERGÍA_AL_NÚCLEO... ]",
        genesisTransferComplete: "[ GENESIS_SUPPLY_TRANSFER_OK ] REACTOR_CARGADO",
        classicTrustlineEstablishing: "[ PHASELQ_CLÁSICO ] VERIFICANDO_TRUSTLINE_PARA_RECOMPENSA...",
        classicTrustlineFreighter: "[ WALLET ] ESPERANDO_FIRMA_changeTrust...",
        classicTrustlineConfirmed: "[ TRUSTLINE_OK ] LÍNEA_ACTIVO_CLÁSICA_LISTA",
        classicTrustlineRejected: "[ TRUSTLINE_DENEGADA ] ABORTO_OPERADOR",
        classicTrustlineAccountMissing: "[ CUENTA_INEXISTENTE ] FONDEAR_XLM_TESTNET_PRIMERO",
      },
      artifact: {
        registeredDefault: "ARTEFACTO_UTILIDAD_PHASE // REGISTRADO",
        owner: "PROPIETARIO",
        serial: "SERIE",
        powerLevel: "NIVEL_ENERGÍA",
        readonly: "[ VISTA_ACTIVO_INTELIGENTE // SOLO_LECTURA ]",
        noVisual: "[ SIN_CANAL_VISUAL ]",
        ariaLabel: "Artefacto NFT de utilidad PHASE",
        sepSuffix: "// SEP-20",
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
        metadataStandard: "ESTÁNDAR_METADATA",
        previewOnly: "[ SOLO_VISTA_PREVIA ]",
        decryptingImage: "[ DESCIFRANDO_IMAGEN ]",
        monitorCollectionName: "NOMBRE_COLECCIÓN",
        monitorContractAddr: "DIRECCIÓN_CONTRATO",
        supplyStabilized: "SUMINISTRO_ESTABILIZADO",
        secretId: "ID_SECRETO",
        holderSignature: "FIRMA_TITULAR",
        rawMetadata: "METADATA_CRUDA",
        pendingOwnershipVerification: "[ PENDIENTE_VERIFICACIÓN_PROPIEDAD ]",
        imageLoadHint:
          "La imagen no cargó (CORS, gateway IPFS lento o enlace inválido). Abrí la URL en otra pestaña o probá otro gateway.",
        openImageUrl: "Abrir URL de imagen",
      },
    },
  },
}

export function pickCopy(lang: AppLang) {
  return phaseCopy[lang]
}
