import { NextRequest, NextResponse } from "next/server"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { serverDataJsonPath } from "@/lib/server-data-paths"
import {
  classicLiqIssuerForStellarToml,
  expectedClassicPhaserLiqSorobanContractId,
  readClassicWalletStatus,
} from "@/lib/classic-liq"
import { validateFaucetIssuerConfig } from "@/lib/env-validation"
import { warnPhaserLiqSacMismatchOnce } from "@/lib/phaser-liq-sac-warn"
import { resolvePhaserLiqClassicAsset, summarizeSorobanFailedMint } from "@/lib/stellar"
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk"
import {
  checkHasPhased,
  fetchCreatorCollectionId,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  PHASER_FAUCET_MINT_STROOPS,
  RPC_URL,
  tokenContractIdForServer,
  userOwnsAnyPhaseToken,
} from "@/lib/phase-protocol"

/** Vercel Hobby ~10s: el poll largo anterior (20×1.5s) cortaba la función → 502 del gateway. */
export const maxDuration = 25

/** Sin caché de respuesta de ruta: cada POST vuelve a simular/preparar en cadena. */
export const dynamic = 'force-dynamic'

const PHASE_LIQ_TOKEN_CONTRACT = tokenContractIdForServer()

const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000
const FAUCET_PENDING_TTL_MS = 8 * 60 * 1000
const FAUCET_POLL_INTERVAL_MS = 1000
const FAUCET_MAX_POLLS_PER_REQUEST = 4
const QUEST_REWARD_STROOPS = "30000000"
const DAILY_REWARD_STROOPS = "20000000"

/** Por debajo de esto, Soroban suele fallar (trap / ihf_trapped) por falta de XLM para fees y renta. */
const MIN_SIGNER_NATIVE_XLM = 5

const QUEST_IDS = ["quest_connect_wallet", "quest_first_collection", "quest_first_settle"] as const
type QuestId = (typeof QUEST_IDS)[number]
type RewardType = "genesis" | "daily" | QuestId

type WalletClaims = {
  genesisAt?: number
  dailyAt?: number
  quests?: Partial<Record<QuestId, number>>
  /** Mint ya enviado; reutilizamos el hash para seguir el poll sin reenviar (serverless timeout). */
  faucetPending?: { hash: string; reward: RewardType; at: number }
}

type FaucetClaims = Record<string, WalletClaims>
type QuestProgress = {
  completed: boolean
  progressPct: number
  requirementText: string
}

type RewardStatus = {
  claimable: boolean
  claimedAt: number | null
  nextAt: number | null
  amountStroops: string
  requirementMet?: boolean
  progressPct?: number
  requirementText?: string
}

function parseRewardType(input: unknown): RewardType {
  const value = typeof input === "string" ? input.trim().toLowerCase() : ""
  if (value === "genesis" || value === "daily") return value
  if (QUEST_IDS.includes(value as QuestId)) return value as QuestId
  return "genesis"
}

function claimsFilePath() {
  return serverDataJsonPath("faucetClaims")
}

async function readClaims(): Promise<FaucetClaims> {
  try {
    const raw = await readFile(claimsFilePath(), "utf8")
    const parsed = JSON.parse(raw) as Record<string, number | WalletClaims>
    if (!parsed || typeof parsed !== "object") return {}
    const normalized: FaucetClaims = {}
    for (const [wallet, value] of Object.entries(parsed)) {
      if (typeof value === "number") {
        normalized[wallet] = { genesisAt: value }
        continue
      }
      if (!value || typeof value !== "object") continue
      const fp = value.faucetPending
      let faucetPending: WalletClaims["faucetPending"]
      if (fp && typeof fp === "object" && typeof fp.hash === "string" && typeof fp.at === "number") {
        const r = parseRewardType(fp.reward)
        faucetPending = { hash: fp.hash, reward: r, at: fp.at }
      }
      normalized[wallet] = {
        genesisAt: typeof value.genesisAt === "number" ? value.genesisAt : undefined,
        dailyAt: typeof value.dailyAt === "number" ? value.dailyAt : undefined,
        quests: value.quests && typeof value.quests === "object" ? value.quests : {},
        faucetPending,
      }
    }
    return normalized
  } catch {
    return {}
  }
}

async function writeClaims(claims: FaucetClaims) {
  const file = claimsFilePath()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(claims, null, 2), "utf8")
}

function faucetUsesDistributorTransfer(): boolean {
  const s = process.env.FAUCET_DISTRIBUTOR_SECRET_KEY?.trim()
  return Boolean(s && s.length >= 20)
}

function faucetConfigured(): boolean {
  if (faucetUsesDistributorTransfer()) return true
  const secret = process.env.ADMIN_SECRET_KEY?.trim()
  return Boolean(secret && secret.length >= 20)
}

async function fetchNativeXlmBalance(gAddress: string): Promise<number | null> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(gAddress)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { balances?: Array<{ asset_type?: string; balance?: string }> }
    const native = data.balances?.find((b) => b.asset_type === "native")
    if (!native?.balance) return null
    const n = parseFloat(native.balance)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** Mismo contrato token que el resto de la app (`lib/phase-protocol.ts`), ya validado como C…. */
function serverTokenContractId(): string {
  return PHASE_LIQ_TOKEN_CONTRACT
}

function rewardAmountStroops(reward: RewardType): string {
  if (reward === "genesis") return PHASER_FAUCET_MINT_STROOPS
  if (reward === "daily") return DAILY_REWARD_STROOPS
  return QUEST_REWARD_STROOPS
}

function isQuestReward(reward: RewardType): reward is QuestId {
  return QUEST_IDS.includes(reward as QuestId)
}

async function readQuestProgress(wallet: string | null): Promise<Record<QuestId, QuestProgress>> {
  const connectText = "Connect wallet is required."
  const collectionText = "Create at least one collection on-chain first."
  const settleText = "Complete at least one settlement (phase mint) first."
  if (!wallet) {
    return {
      quest_connect_wallet: { completed: false, progressPct: 0, requirementText: connectText },
      quest_first_collection: { completed: false, progressPct: 0, requirementText: collectionText },
      quest_first_settle: { completed: false, progressPct: 0, requirementText: settleText },
    }
  }

  try {
    const creatorCollectionId = await fetchCreatorCollectionId(wallet)
    const hasCollection = Boolean(creatorCollectionId && creatorCollectionId > 0)

    const defaultPhase = await checkHasPhased(wallet, 0)
    let creatorPhase = { phased: false }
    if (creatorCollectionId && creatorCollectionId > 0) {
      creatorPhase = await checkHasPhased(wallet, creatorCollectionId)
    }
    const quickSettlementMatch = defaultPhase.phased || creatorPhase.phased
    const anyOwnedSettlement = quickSettlementMatch ? true : await userOwnsAnyPhaseToken(wallet)
    const hasSettlement = quickSettlementMatch || anyOwnedSettlement

    return {
      quest_connect_wallet: { completed: true, progressPct: 100, requirementText: connectText },
      quest_first_collection: {
        completed: hasCollection,
        progressPct: hasCollection ? 100 : 0,
        requirementText: collectionText,
      },
      quest_first_settle: {
        completed: hasSettlement,
        progressPct: hasSettlement ? 100 : hasCollection ? 40 : 0,
        requirementText: settleText,
      },
    }
  } catch {
    return {
      quest_connect_wallet: { completed: true, progressPct: 100, requirementText: connectText },
      quest_first_collection: { completed: false, progressPct: 0, requirementText: collectionText },
      quest_first_settle: { completed: false, progressPct: 0, requirementText: settleText },
    }
  }
}

function claimStatusForReward(claim: WalletClaims, reward: RewardType, now: number): RewardStatus {
  if (reward === "genesis") {
    return {
      claimable: !claim.genesisAt,
      claimedAt: claim.genesisAt ?? null,
      nextAt: null,
      amountStroops: rewardAmountStroops("genesis"),
    }
  }

  if (reward === "daily") {
    const last = claim.dailyAt ?? 0
    const claimable = !last || now - last >= DAILY_WINDOW_MS
    return {
      claimable,
      claimedAt: last || null,
      nextAt: claimable ? null : last + DAILY_WINDOW_MS,
      amountStroops: rewardAmountStroops("daily"),
    }
  }

  const at = claim.quests?.[reward] ?? 0
  return {
    claimable: !at,
    claimedAt: at || null,
    nextAt: null,
    amountStroops: rewardAmountStroops(reward),
  }
}

async function buildWalletStatus(wallet: string | null, claims: FaucetClaims) {
  const now = Date.now()
  const claim = wallet ? claims[wallet] ?? {} : {}
  const questProgress = await readQuestProgress(wallet)
  const rawGenesis = claimStatusForReward(claim, "genesis", now)
  const rawDaily = claimStatusForReward(claim, "daily", now)
  const rawQuestConnect = claimStatusForReward(claim, "quest_connect_wallet", now)
  const rawQuestCollection = claimStatusForReward(claim, "quest_first_collection", now)
  const rawQuestSettle = claimStatusForReward(claim, "quest_first_settle", now)

  const questConnect: RewardStatus = {
    ...rawQuestConnect,
    claimable: rawQuestConnect.claimable && questProgress.quest_connect_wallet.completed,
    requirementMet: Boolean(rawQuestConnect.claimedAt) || questProgress.quest_connect_wallet.completed,
    progressPct: rawQuestConnect.claimedAt ? 100 : questProgress.quest_connect_wallet.progressPct,
    requirementText: questProgress.quest_connect_wallet.requirementText,
  }
  const questCollection: RewardStatus = {
    ...rawQuestCollection,
    claimable: rawQuestCollection.claimable && questProgress.quest_first_collection.completed,
    requirementMet: Boolean(rawQuestCollection.claimedAt) || questProgress.quest_first_collection.completed,
    progressPct: rawQuestCollection.claimedAt ? 100 : questProgress.quest_first_collection.progressPct,
    requirementText: questProgress.quest_first_collection.requirementText,
  }
  const questSettle: RewardStatus = {
    ...rawQuestSettle,
    claimable: rawQuestSettle.claimable && questProgress.quest_first_settle.completed,
    requirementMet: Boolean(rawQuestSettle.claimedAt) || questProgress.quest_first_settle.completed,
    progressPct: rawQuestSettle.claimedAt ? 100 : questProgress.quest_first_settle.progressPct,
    requirementText: questProgress.quest_first_settle.requirementText,
  }

  const questCompletion = [questConnect, questCollection, questSettle].map((r) =>
    r.claimedAt || r.requirementMet ? 1 : 0,
  )
  const questsDone = Number(questCompletion[0]) + Number(questCompletion[1]) + Number(questCompletion[2])
  return {
    enabled: faucetConfigured(),
    payoutMode: faucetConfigured() ? (faucetUsesDistributorTransfer() ? "transfer" : "mint") : null,
    wallet,
    dailyWindowMs: DAILY_WINDOW_MS,
    questOverview: {
      completed: questsDone,
      total: 3,
      progressPct: Math.round((questsDone / 3) * 100),
    },
    rewards: {
      genesis: rawGenesis,
      daily: rawDaily,
      quest_connect_wallet: questConnect,
      quest_first_collection: questCollection,
      quest_first_settle: questSettle,
    },
  }
}

/** Cliente puede comprobar disponibilidad y estado por wallet (sin filtrar secretos). */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("walletAddress")?.trim() ?? null
  if (wallet && !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json({ error: "walletAddress inválida." }, { status: 400 })
  }
  const claims = await readClaims()
  return NextResponse.json(await buildWalletStatus(wallet, claims))
}

async function markClaim(wallet: string, reward: RewardType) {
  const claims = await readClaims()
  const walletClaim = claims[wallet] ?? {}
  walletClaim.faucetPending = undefined
  const now = Date.now()
  if (reward === "genesis") walletClaim.genesisAt = now
  if (reward === "daily") walletClaim.dailyAt = now
  if (QUEST_IDS.includes(reward as QuestId)) {
    walletClaim.quests = walletClaim.quests ?? {}
    walletClaim.quests[reward as QuestId] = now
  }
  claims[wallet] = walletClaim
  await writeClaims(claims)
}

async function clearFaucetPendingOnly(wallet: string) {
  const claims = await readClaims()
  const w = claims[wallet]
  if (!w?.faucetPending) return
  w.faucetPending = undefined
  claims[wallet] = w
  await writeClaims(claims)
}

type MintPollResult =
  | { outcome: "SUCCESS" }
  | { outcome: "FAILED"; failed: rpc.Api.GetFailedTransactionResponse }
  | { outcome: "PENDING" }

/** A lo sumo ~5s de espera por invocación (compatible con timeout serverless). */
async function pollSubmittedMint(soroban: rpc.Server, hash: string): Promise<MintPollResult> {
  for (let i = 0; i < FAUCET_MAX_POLLS_PER_REQUEST; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, FAUCET_POLL_INTERVAL_MS))
    }
    try {
      const st = await soroban.getTransaction(hash)
      if (st.status === rpc.Api.GetTransactionStatus.SUCCESS) return { outcome: "SUCCESS" }
      if (st.status === rpc.Api.GetTransactionStatus.FAILED) {
        return { outcome: "FAILED", failed: st as rpc.Api.GetFailedTransactionResponse }
      }
    } catch {
      // RPC intermitente: seguir intentando dentro del presupuesto de polls
    }
  }
  return { outcome: "PENDING" }
}

function faucetMintLedgerFailedResponse(
  hash: string,
  failed: rpc.Api.GetFailedTransactionResponse,
): NextResponse {
  const sorobanSummary = summarizeSorobanFailedMint(failed)
  console.error("[faucet] Soroban mint/transfer FAILED (trustline ya verificada en esta petición)", {
    hash,
    sorobanSummary,
    ledger: failed.ledger,
  })
  return NextResponse.json(
    {
      error: "La transacción falló en el ledger (Soroban).",
      code: "FAUCET_MINT_LEDGER_FAILED",
      detail: `En esta petición ya comprobamos en Horizon que tenías trustline PHASELQ (mismo code+issuer que la app). El rechazo viene del contrato token o de otra regla on-chain, no de “falta trustline”. Detalle: ${sorobanSummary}. Abre el hash en Stellar Expert (Soroban testnet) para ver el motivo exacto.`,
      hash,
      sorobanSummary,
    },
    { status: 502 },
  )
}

/**
 * El mint Soroban acredita el mismo PHASELQ que el asset clásico: sin trustline el ledger rechaza la tx.
 * Usa solo vars públicas (NEXT_PUBLIC_CLASSIC_LIQ_*) — no requiere CLASSIC_LIQ_ISSUER_SECRET.
 */
async function preflightClassicTrustlineForMint(userAddress: string): Promise<NextResponse | null> {
  const asset = resolvePhaserLiqClassicAsset()
  try {
    const ws = await readClassicWalletStatus(userAddress, asset)
    if (!ws.accountExists) {
      return NextResponse.json(
        {
          error: "Cuenta de usuario no encontrada en testnet.",
          code: "USER_ACCOUNT_NOT_FOUND",
          detail: `La wallet ${userAddress.slice(0, 8)}... no existe en Stellar testnet. ` +
                  `Debes fondearla primero con XLM usando Friendbot antes de poder recibir PHASELQ.`,
          hint: `Visita: https://friendbot.stellar.org/?addr=${userAddress}`,
          action: "Fondea tu cuenta con XLM usando Friendbot, luego vuelve a intentar.",
        },
        { status: 412 },
      )
    }
    if (!ws.hasTrustline) {
      return NextResponse.json(
        {
          error: "Trustline PHASELQ no encontrada.",
          code: "TRUSTLINE_REQUIRED",
          detail: `Tu wallet ${userAddress.slice(0, 8)}... existe pero no tiene trustline para ${asset.code}:${asset.issuer.slice(0, 8)}... ` +
                  `Sin trustline, el ledger de Stellar rechazará cualquier recepción de este asset.`,
          hint: "En la página de Forge, haz clic en 'INITIALIZE PHASER PROTOCOL' para establecer la trustline automáticamente.",
          actionSteps: [
            "1. Ve a la página /forge",
            "2. Conecta tu wallet Freighter",
            "3. Haz clic en 'INITIALIZE PHASER PROTOCOL'",
            "4. Firma la transacción changeTrust en Freighter",
            "5. Vuelve a intentar reclamar del faucet",
          ],
          asset,
        },
        { status: 412 },
      )
    }

    // Validación adicional: verificar que el usuario tenga algo de XLM para fees
    // (aunque el faucet paga el mint, el usuario necesita XLM para operaciones futuras)
    const userXlmRes = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(userAddress)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (userXlmRes.ok) {
      const userData = await userXlmRes.json() as { balances?: Array<{ asset_type?: string; balance?: string }> }
      const nativeBalance = userData.balances?.find(b => b.asset_type === "native")?.balance
      const xlmAmount = nativeBalance ? parseFloat(nativeBalance) : 0
      if (xlmAmount < 1) {
        console.warn(`[faucet] Warning: user ${userAddress.slice(0, 8)}... has only ${xlmAmount} XLM. Consider funding more.`)
      }
    }
  } catch (e) {
    // Horizon intermitente: loggear pero no bloqueamos el mint
    console.warn("[faucet] Horizon check failed, proceeding anyway:", e instanceof Error ? e.message : String(e))
    return null
  }
  return null
}

/**
 * PHASELQ al usuario:
 * - **mint** (por defecto): firma `ADMIN_SECRET_KEY` — en el Stellar Asset Contract debe ser el **Issuer** (G… del asset), no un distribuidor.
 * - **transfer** (opcional): si existe `FAUCET_DISTRIBUTOR_SECRET_KEY`, se llama `transfer(distribuidor → usuario)`; el distribuidor debe tener saldo y XLM para fees.
 *
 * Body: `{ "walletAddress": "G…", "reward": "genesis|daily|quest_*" }`
 */
export async function POST(req: NextRequest) {
  if (!faucetConfigured()) {
    return NextResponse.json(
      {
        error:
          "Faucet desactivado: define ADMIN_SECRET_KEY (mint como issuer del SAC) o FAUCET_DISTRIBUTOR_SECRET_KEY (transfer desde billetera con liquidez). Reinicia el servidor.",
        code: "FAUCET_NOT_CONFIGURED",
      },
      { status: 503 },
    )
  }

  let body: { walletAddress?: string; userAddress?: string; reward?: string }
  try {
    body = (await req.json()) as { walletAddress?: string; userAddress?: string; reward?: string }
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
  }

  const userAddress = (body.walletAddress ?? body.userAddress)?.trim()
  if (!userAddress || !StrKey.isValidEd25519PublicKey(userAddress)) {
    return NextResponse.json(
      { error: "walletAddress (o userAddress) debe ser una cuenta Stellar G válida." },
      { status: 400 },
    )
  }

  const reward = parseRewardType(body.reward)
  const claims = await readClaims()
  const walletClaim = claims[userAddress] ?? {}

  if (isQuestReward(reward)) {
    const q = await readQuestProgress(userAddress)
    const quest = q[reward]
    if (!quest.completed) {
      return NextResponse.json(
        {
          error: `Quest requirement not met: ${quest.requirementText}`,
          reward,
          requirementMet: false,
          progressPct: quest.progressPct,
        },
        { status: 412 },
      )
    }
  }

  const status = claimStatusForReward(walletClaim, reward, Date.now())
  if (!status.claimable) {
    const already = status.nextAt
      ? "Reward on cooldown. Claim it again after reset."
      : "Reward already claimed for this wallet."
    return NextResponse.json(
      {
        error: already,
        code: status.nextAt ? "FAUCET_COOLDOWN" : "FAUCET_REWARD_ALREADY_CLAIMED",
        reward,
        claimedAt: status.claimedAt,
        nextAt: status.nextAt,
      },
      { status: status.nextAt ? 429 : 409 },
    )
  }

  const trustlineBlock = await preflightClassicTrustlineForMint(userAddress)
  if (trustlineBlock) return trustlineBlock

  const useTransfer = faucetUsesDistributorTransfer()
  let signerKp: Keypair
  if (useTransfer) {
    const distSecret = process.env.FAUCET_DISTRIBUTOR_SECRET_KEY!.trim()
    try {
      signerKp = Keypair.fromSecret(distSecret)
    } catch {
      return NextResponse.json(
        { error: "FAUCET_DISTRIBUTOR_SECRET_KEY no es un secret Stellar válido.", code: "FAUCET_BAD_DISTRIBUTOR_SECRET" },
        { status: 500 },
      )
    }
  } else {
    const adminSecret = process.env.ADMIN_SECRET_KEY?.trim()
    if (!adminSecret || adminSecret.length < 20) {
      return NextResponse.json(
        {
          error: "Falta ADMIN_SECRET_KEY para modo mint, o usa FAUCET_DISTRIBUTOR_SECRET_KEY para modo transfer.",
          code: "FAUCET_ADMIN_MISSING",
        },
        { status: 503 },
      )
    }
    try {
      signerKp = Keypair.fromSecret(adminSecret)
    } catch {
      return NextResponse.json({ error: "ADMIN_SECRET_KEY no es un secret Stellar válido." }, { status: 500 })
    }
  }

  const tokenId = serverTokenContractId()
  warnPhaserLiqSacMismatchOnce(tokenId, "faucet")
  const server = new rpc.Server(RPC_URL)
  const source = signerKp.publicKey()

  // Validación estricta: en modo mint, el signer DEBE ser el issuer del asset clásico
  if (!useTransfer) {
    const sacExpected = expectedClassicPhaserLiqSorobanContractId()
    const issuerG = classicLiqIssuerForStellarToml()

    // Verificar mismatch usando la nueva función de validación
    const issuerValidationError = validateFaucetIssuerConfig(
      process.env.ADMIN_SECRET_KEY,
      issuerG,
    )

    if (issuerValidationError) {
      return NextResponse.json(
        {
          error: issuerValidationError,
          code: "FAUCET_ADMIN_NOT_ISSUER",
          expectedIssuer: issuerG,
          signerPublic: source,
          hint: "Para modo mint, ADMIN_SECRET_KEY debe ser el secret del issuer del asset PHASELQ. " +
                "O configura FAUCET_DISTRIBUTOR_SECRET_KEY para usar modo transfer.",
        },
        { status: 503 },
      )
    }

    // Validación adicional: verificar que el tokenId coincida con el SAC esperado
    if (tokenId !== sacExpected) {
      console.warn("[faucet] Warning: PHASE_LIQ_TOKEN_CONTRACT no coincide con el SAC derivado del asset clásico", {
        configured: tokenId,
        expectedFromClassic: sacExpected,
      })
    }
  }

  // Validación estricta de balance XLM antes de intentar cualquier transacción
  const nativeXlm = await fetchNativeXlmBalance(source)
  if (nativeXlm === null) {
    return NextResponse.json(
      {
        error: `No se pudo verificar el balance XLM de la cuenta firmante (${source.slice(0, 8)}...). ` +
               `Asegúrate de que la cuenta exista en testnet y tenga fondos.`,
        code: "FAUCET_SIGNER_ACCOUNT_NOT_FOUND",
        signer: source,
        hint: "Fondea la cuenta con Friendbot: https://friendbot.stellar.org/?addr=" + source,
      },
      { status: 503 },
    )
  }

  if (nativeXlm < MIN_SIGNER_NATIVE_XLM) {
    return NextResponse.json(
      {
        error: `La cuenta firmante tiene solo ${nativeXlm.toFixed(2)} XLM, pero se requieren al menos ${MIN_SIGNER_NATIVE_XLM} XLM ` +
               `para pagar fees de Soroban y renta de almacenamiento. Sin suficiente XLM, las transacciones fallan con ` +
               `"trap" o "ihf_trapped" (insufficient balance para fees).`,
        code: "FAUCET_SIGNER_LOW_XLM",
        signer: source,
        nativeXlmApprox: nativeXlm,
        minRequiredXlm: MIN_SIGNER_NATIVE_XLM,
        hint: `Fondea la cuenta ${source.slice(0, 8)}... con al menos ${MIN_SIGNER_NATIVE_XLM - nativeXlm + 1} XLM más usando Friendbot.`,
      },
      { status: 503 },
    )
  }

  try {
    const now = Date.now()
    let liveClaims = await readClaims()
    let row: WalletClaims = { ...(liveClaims[userAddress] ?? {}) }

    if (row.faucetPending && now - row.faucetPending.at > FAUCET_PENDING_TTL_MS) {
      row = { ...row, faucetPending: undefined }
      liveClaims[userAddress] = row
      await writeClaims(liveClaims)
    }

    if (row.faucetPending?.reward === reward) {
      const pendingHash = row.faucetPending.hash
      const out = await pollSubmittedMint(server, pendingHash)
      if (out.outcome === "SUCCESS") {
        await markClaim(userAddress, reward)
        return NextResponse.json({
          ok: true,
          hash: pendingHash,
          reward,
          amountStroops: rewardAmountStroops(reward),
        })
      }
      if (out.outcome === "FAILED") {
        await clearFaucetPendingOnly(userAddress)
        return faucetMintLedgerFailedResponse(pendingHash, out.failed)
      }
      return NextResponse.json(
        {
          ok: false,
          hash: pendingHash,
          pending: true,
          reward,
          amountStroops: rewardAmountStroops(reward),
          note: "Transaction still pending on ledger. Retry the same reward in a few seconds.",
        },
        { status: 202 },
      )
    }

    if (row.faucetPending && row.faucetPending.reward !== reward) {
      return NextResponse.json(
        {
          error:
            "Hay otra recompensa de faucet confirmándose en ledger. Espera unos segundos y vuelve a intentar esta recompensa.",
          code: "FAUCET_MINT_IN_PROGRESS",
          reward,
          blockingReward: row.faucetPending.reward,
        },
        { status: 409 },
      )
    }

    const account = await server.getAccount(source)
    const c = new Contract(tokenId)
    const amountSc = nativeToScVal(BigInt(rewardAmountStroops(reward)), { type: "i128" })
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        useTransfer
          ? c.call(
              "transfer",
              Address.fromString(source).toScVal(),
              Address.fromString(userAddress).toScVal(),
              amountSc,
            )
          : c.call("mint", Address.fromString(userAddress).toScVal(), amountSc),
      )
      .setTimeout(30)
      .build()

    const prepared = await server.prepareTransaction(tx)
    prepared.sign(signerKp)
    const send = await server.sendTransaction(prepared)
    if (send.status === "ERROR") {
      const err = (send as { errorResult?: unknown }).errorResult
      return NextResponse.json(
        { error: "RPC rechazó la transacción.", detail: String(err ?? send) },
        { status: 502 },
      )
    }
    const hash = send.hash as string

    liveClaims = await readClaims()
    liveClaims[userAddress] = {
      ...(liveClaims[userAddress] ?? {}),
      faucetPending: { hash, reward, at: Date.now() },
    }
    await writeClaims(liveClaims)

    const out = await pollSubmittedMint(server, hash)
    if (out.outcome === "SUCCESS") {
      await markClaim(userAddress, reward)
      return NextResponse.json({ ok: true, hash, reward, amountStroops: rewardAmountStroops(reward) })
    }
    if (out.outcome === "FAILED") {
      await clearFaucetPendingOnly(userAddress)
      return faucetMintLedgerFailedResponse(hash, out.failed)
    }
    return NextResponse.json(
      {
        ok: false,
        hash,
        pending: true,
        reward,
        amountStroops: rewardAmountStroops(reward),
        note: "Transaction still pending on ledger. Retry the same reward in a few seconds.",
      },
      { status: 202 },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
