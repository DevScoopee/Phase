import { NextRequest, NextResponse } from "next/server"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { serverDataJsonPath } from "@/lib/server-data-paths"
import { readClassicWalletStatus } from "@/lib/classic-liq"
import { resolvePhaserLiqClassicAsset } from "@/lib/stellar"
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
  NETWORK_PASSPHRASE,
  PHASER_FAUCET_MINT_STROOPS,
  RPC_URL,
  TOKEN_ADDRESS,
  userOwnsAnyPhaseToken,
} from "@/lib/phase-protocol"

/** Vercel Hobby ~10s: el poll largo anterior (20×1.5s) cortaba la función → 502 del gateway. */
export const maxDuration = 25

const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000
const FAUCET_PENDING_TTL_MS = 8 * 60 * 1000
const FAUCET_POLL_INTERVAL_MS = 1000
const FAUCET_MAX_POLLS_PER_REQUEST = 4
const QUEST_REWARD_STROOPS = "30000000"
const DAILY_REWARD_STROOPS = "20000000"

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

function faucetConfigured(): boolean {
  const secret = process.env.ADMIN_SECRET_KEY?.trim()
  return Boolean(secret && secret.length >= 20)
}

/** Mismo contrato token que el resto de la app (`lib/phase-protocol.ts`), ya validado como C…. */
function serverTokenContractId(): string {
  return TOKEN_ADDRESS
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

/** A lo sumo ~5s de espera por invocación (compatible con timeout serverless). */
async function pollSubmittedMint(soroban: rpc.Server, hash: string): Promise<"SUCCESS" | "FAILED" | "PENDING"> {
  for (let i = 0; i < FAUCET_MAX_POLLS_PER_REQUEST; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, FAUCET_POLL_INTERVAL_MS))
    }
    try {
      const st = await soroban.getTransaction(hash)
      if (st.status === rpc.Api.GetTransactionStatus.SUCCESS) return "SUCCESS"
      if (st.status === rpc.Api.GetTransactionStatus.FAILED) return "FAILED"
    } catch {
      // RPC intermitente: seguir intentando dentro del presupuesto de polls
    }
  }
  return "PENDING"
}

/**
 * El mint Soroban acredita el mismo PHASERLIQ que el asset clásico: sin trustline el ledger rechaza la tx.
 * Usa solo vars públicas (NEXT_PUBLIC_CLASSIC_LIQ_*) — no requiere CLASSIC_LIQ_ISSUER_SECRET.
 */
async function preflightClassicTrustlineForMint(userAddress: string): Promise<NextResponse | null> {
  const asset = resolvePhaserLiqClassicAsset()
  try {
    const ws = await readClassicWalletStatus(userAddress, asset)
    if (!ws.accountExists) {
      return NextResponse.json(
        {
          error: "Cuenta no encontrada en testnet.",
          code: "ACCOUNT_NOT_FOUND",
          detail:
            "Fóndate con Friendbot (XLM). Luego en Forja completa INITIALIZE PHASER PROTOCOL (trustline) y vuelve a reclamar.",
        },
        { status: 412 },
      )
    }
    if (!ws.hasTrustline) {
      return NextResponse.json(
        {
          error: "Falta la trustline PHASERLIQ.",
          code: "TRUSTLINE_REQUIRED",
          detail:
            "En Forja pulsa INITIALIZE PHASER PROTOCOL, firma changeTrust en Freighter y reclama de nuevo. Sin esto el mint falla en ledger.",
        },
        { status: 412 },
      )
    }
  } catch {
    // Horizon intermitente: no bloqueamos el mint (comportamiento previo).
    return null
  }
  return null
}

/**
 * Acuña PHASERLIQ vía `mint` del contrato token (firma ADMIN_SECRET_KEY).
 * Body: `{ "walletAddress": "G…", "reward": "genesis|daily|quest_*" }`
 */
export async function POST(req: NextRequest) {
  if (!faucetConfigured()) {
    return NextResponse.json(
      {
        error:
          "Faucet desactivado: define ADMIN_SECRET_KEY en .env.local. El ID del contrato token es el mismo que en NEXT_PUBLIC_* / TOKEN_CONTRACT_ID (debe ser C…, nunca una cuenta G…). Reinicia el servidor.",
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

  const adminSecret = process.env.ADMIN_SECRET_KEY!.trim()
  let adminKp: Keypair
  try {
    adminKp = Keypair.fromSecret(adminSecret)
  } catch {
    return NextResponse.json({ error: "ADMIN_SECRET_KEY no es un secret Stellar válido." }, { status: 500 })
  }

  const tokenId = serverTokenContractId()
  const server = new rpc.Server(RPC_URL)
  const source = adminKp.publicKey()

  const ledgerFailHint =
    " Suele deberse a trustline PHASERLIQ (mismo code+issuer que en Freighter) sin crear: Forja → INITIALIZE PHASER PROTOCOL, luego reintenta."

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
      if (out === "SUCCESS") {
        await markClaim(userAddress, reward)
        return NextResponse.json({
          ok: true,
          hash: pendingHash,
          reward,
          amountStroops: rewardAmountStroops(reward),
        })
      }
      if (out === "FAILED") {
        await clearFaucetPendingOnly(userAddress)
        return NextResponse.json(
          { error: `La transacción falló en ledger.${ledgerFailHint}`, hash: pendingHash },
          { status: 502 },
        )
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
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        c.call(
          "mint",
          Address.fromString(userAddress).toScVal(),
          nativeToScVal(BigInt(rewardAmountStroops(reward)), { type: "i128" }),
        ),
      )
      .setTimeout(30)
      .build()

    const prepared = await server.prepareTransaction(tx)
    prepared.sign(adminKp)
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
    if (out === "SUCCESS") {
      await markClaim(userAddress, reward)
      return NextResponse.json({ ok: true, hash, reward, amountStroops: rewardAmountStroops(reward) })
    }
    if (out === "FAILED") {
      await clearFaucetPendingOnly(userAddress)
      return NextResponse.json(
        { error: `La transacción falló en ledger.${ledgerFailHint}`, hash },
        { status: 502 },
      )
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
