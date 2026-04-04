import { NextRequest, NextResponse } from "next/server"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
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

const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000
const QUEST_REWARD_STROOPS = "30000000"
const DAILY_REWARD_STROOPS = "20000000"

const QUEST_IDS = ["quest_connect_wallet", "quest_first_collection", "quest_first_settle"] as const
type QuestId = (typeof QUEST_IDS)[number]
type RewardType = "genesis" | "daily" | QuestId

type WalletClaims = {
  genesisAt?: number
  dailyAt?: number
  quests?: Partial<Record<QuestId, number>>
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

function claimsFilePath() {
  const rel = process.env.FAUCET_CLAIMS_FILE?.trim() || ".data/faucet-claims.json"
  return path.resolve(process.cwd(), rel)
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
      normalized[wallet] = {
        genesisAt: typeof value.genesisAt === "number" ? value.genesisAt : undefined,
        dailyAt: typeof value.dailyAt === "number" ? value.dailyAt : undefined,
        quests: value.quests && typeof value.quests === "object" ? value.quests : {},
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

function serverTokenContractId(): string {
  return (
    process.env.TOKEN_CONTRACT_ID?.trim() ||
    process.env.MOCK_TOKEN_ID?.trim() ||
    process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID?.trim() ||
    TOKEN_ADDRESS
  )
}

function rewardAmountStroops(reward: RewardType): string {
  if (reward === "genesis") return PHASER_FAUCET_MINT_STROOPS
  if (reward === "daily") return DAILY_REWARD_STROOPS
  return QUEST_REWARD_STROOPS
}

function isQuestReward(reward: RewardType): reward is QuestId {
  return QUEST_IDS.includes(reward as QuestId)
}

function parseRewardType(input: unknown): RewardType {
  const value = typeof input === "string" ? input.trim().toLowerCase() : ""
  if (value === "genesis" || value === "daily") return value
  if (QUEST_IDS.includes(value as QuestId)) return value as QuestId
  return "genesis"
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

/**
 * Acuña PHASER_LIQ vía `mint` del contrato token (firma ADMIN_SECRET_KEY).
 * Body: `{ "walletAddress": "G…", "reward": "genesis|daily|quest_*" }`
 */
export async function POST(req: NextRequest) {
  if (!faucetConfigured()) {
    return NextResponse.json(
      {
        error:
          "Faucet desactivado: define ADMIN_SECRET_KEY (y opcionalmente TOKEN_CONTRACT_ID / MOCK_TOKEN_ID) en .env.local y reinicia el servidor.",
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
        reward,
        claimedAt: status.claimedAt,
        nextAt: status.nextAt,
      },
      { status: status.nextAt ? 429 : 409 },
    )
  }

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

  try {
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
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      const st = await server.getTransaction(hash)
      if (st.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        await markClaim(userAddress, reward)
        return NextResponse.json({ ok: true, hash, reward, amountStroops: rewardAmountStroops(reward) })
      }
      if (st.status === rpc.Api.GetTransactionStatus.FAILED) {
        return NextResponse.json(
          { error: "La transacción falló en ledger.", hash },
          { status: 502 },
        )
      }
    }
    return NextResponse.json(
      {
        ok: false,
        hash,
        pending: true,
        reward,
        amountStroops: rewardAmountStroops(reward),
        note: "Transaction still pending on ledger. Reward claim is not locked until success is confirmed.",
      },
      { status: 202 },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
