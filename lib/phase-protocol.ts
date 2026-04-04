/** Soroban / PHASE protocol — shared client helpers */

import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  nativeToScVal,
  Networks,
  rpc,
  scValToNative,
  StrKey,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk"

/**
 * Soroban contract IDs use strkey prefix **C** (56 chars). A **G** address is a classic *account*, not a contract —
 * using it in `Contract` or WASM fetch causes `Invalid contract ID: G…` from the SDK.
 */
function sorobanContractIdFromEnv(
  envKeys: (string | undefined)[],
  fallback: string,
  settingName: string,
): string {
  const raw = envKeys.map((k) => k?.trim()).find((v) => v && v.length > 0)
  const id = raw ?? fallback
  if (StrKey.isValidContract(id)) return id
  if (StrKey.isValidEd25519PublicKey(id)) {
    throw new Error(
      `[PHASE] ${settingName}: "${id.slice(0, 8)}…" is a Stellar account (G…), not a Soroban contract (C…). ` +
        `Remove it from env or paste the contract ID from \`stellar contract deploy\` / Stellar Expert (contract page).`,
    )
  }
  throw new Error(
    `[PHASE] ${settingName}: not a valid Soroban contract strkey (expected C…). Got: "${id.slice(0, 12)}…"`,
  )
}

const DEFAULT_PHASE_CONTRACT = "CDXZ2HWPSAU3DKACNGTTY3WM6FKN5LPNGMAYFW4KBF74P42RK6SFDRGP"
export const CONTRACT_ID = (() => {
  const e = (typeof process !== "undefined" ? process.env : {}) as NodeJS.ProcessEnv
  return sorobanContractIdFromEnv(
    [e.NEXT_PUBLIC_PHASE_PROTOCOL_ID, e.PHASE_PROTOCOL_ID],
    DEFAULT_PHASE_CONTRACT,
    "PHASE protocol (NEXT_PUBLIC_PHASE_PROTOCOL_ID / PHASE_PROTOCOL_ID)",
  )
})()

/** Contrato PHASE (NFT de utilidad) en Stellar Expert — testnet */
export function stellarExpertTestnetContractUrl(contractId: string = CONTRACT_ID) {
  return `https://stellar.expert/explorer/testnet/contract/${contractId}`
}

/**
 * PHASERLIQ en Stellar Expert (vista de **asset** clásico testnet).
 * @see https://stellar.expert/explorer/testnet/asset/PHASERLIQ-GAXRPE5JXPY7RJONMCEWFXELVWDW3CSA7H6LAGYKTOYLFQQDJ5DT4GNS
 */
export const PHASER_LIQ_STELLAR_EXPERT_DEFAULT =
  "https://stellar.expert/explorer/testnet/asset/PHASERLIQ-GAXRPE5JXPY7RJONMCEWFXELVWDW3CSA7H6LAGYKTOYLFQQDJ5DT4GNS"

/** Enlace UI/docs para la marca PHASERLIQ. Override: `NEXT_PUBLIC_PHASER_LIQ_EXPERT_URL` o `PHASER_LIQ_EXPERT_URL`. */
export function stellarExpertPhaserLiqUrl(): string {
  const e = (typeof process !== "undefined" ? process.env : {}) as NodeJS.ProcessEnv
  return (
    e.NEXT_PUBLIC_PHASER_LIQ_EXPERT_URL?.trim() ||
    e.PHASER_LIQ_EXPERT_URL?.trim() ||
    PHASER_LIQ_STELLAR_EXPERT_DEFAULT
  )
}

/** Certificado JSON tras verificar propiedad (`get_user_phase`) en el cliente. */
export function downloadPhaseUtilityCertificate(opts: {
  contractId: string
  tokenId: number
  ownerAddress: string
  collectionId: number
  collectionName?: string
  energyLevelBp: number
}) {
  if (typeof document === "undefined") return
  const body = JSON.stringify(
    {
      $schema: "phase.certificate/v1",
      network: "soroban-testnet",
      contractId: opts.contractId,
      utilityTokenId: opts.tokenId,
      owner: opts.ownerAddress,
      collectionId: opts.collectionId,
      collectionName: opts.collectionName ?? null,
      energyLevelBp: opts.energyLevelBp,
      issuedAt: new Date().toISOString(),
    },
    null,
    2,
  )
  const blob = new Blob([body], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `PHASE_certificate_token_${opts.tokenId}.json`
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const RPC_URL = "https://soroban-testnet.stellar.org"
/** Classic accounts (G…): sequence comes from Horizon; Soroban RPC does not implement `getAccount`. */
export const HORIZON_URL = "https://horizon-testnet.stellar.org"
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"

/** Cuenta clásica G… (56 chars) válida para Freighter / transferencias. */
export function isValidClassicStellarAddress(addr: string): boolean {
  const t = addr.trim()
  if (!t.startsWith("G") || t.length !== 56) return false
  return StrKey.isValidEd25519PublicKey(t)
}

/**
 * SAC (Stellar Asset Contract) de PHASERLIQ emitido por el issuer clásico de testnet.
 * Debe ser idéntico a `new Asset(code, issuer).contractId(NETWORK_PASSPHRASE)`; si env
 * apunta a otro C…, fallos en mint/transfer/settle pueden parecer trustline u host errors.
 * @see lib/classic-liq.ts `DEFAULT_CLASSIC_PHASER_LIQ_ISSUER` (mismo G… que aquí).
 */
const DEFAULT_PHASER_LIQ_SAC_ISSUER =
  "GAXRPE5JXPY7RJONMCEWFXELVWDW3CSA7H6LAGYKTOYLFQQDJ5DT4GNS"

const DEFAULT_TOKEN_CONTRACT = "CDOAXHWC6YJB7U3ELV67HKJY6HEMJFBNRGJK6WZGUAELBWP3WP77RLFD"

/** Contrato SAC esperado para PHASERLIQ + issuer por defecto (validar contra `TOKEN_ADDRESS`). */
export function expectedDefaultPhaserLiqSACContractId(): string {
  return new Asset("PHASERLIQ", DEFAULT_PHASER_LIQ_SAC_ISSUER).contractId(NETWORK_PASSPHRASE)
}

/** Contrato del token de liquidez del protocolo (Soroban). */
export const TOKEN_ADDRESS = (() => {
  const e = (typeof process !== "undefined" ? process.env : {}) as NodeJS.ProcessEnv
  return sorobanContractIdFromEnv(
    [
      e.NEXT_PUBLIC_PHASER_TOKEN_ID,
      e.PHASER_TOKEN_ID,
      e.NEXT_PUBLIC_TOKEN_CONTRACT_ID,
      e.TOKEN_CONTRACT_ID,
      e.MOCK_TOKEN_ID,
    ],
    DEFAULT_TOKEN_CONTRACT,
    "PHASERLIQ token (NEXT_PUBLIC_PHASER_TOKEN_ID / NEXT_PUBLIC_TOKEN_CONTRACT_ID / …)",
  )
})()

/** Marca oficial del combustible x402 en UI (7 decimales; alineado al código clásico PHASERLIQ). */
export const PHASER_LIQ_SYMBOL = "PHASERLIQ"

/** Normaliza el símbolo leído on-chain (p. ej. contratos legacy `PHASER_LIQ`) a la marca UI `PHASERLIQ`. */
export function displayPhaserLiqSymbol(onChainSymbol: string | null | undefined): string {
  const s = (onChainSymbol ?? "").trim()
  if (!s) return PHASER_LIQ_SYMBOL
  if (s === "PHASER_LIQ") return PHASER_LIQ_SYMBOL
  return s
}
export const PHASER_LIQ_NAME = "Phase Liquidity Token"
export const PHASER_LIQ_DECIMALS = 7
export const PHASER_LIQ_ICON_PUBLIC_PATH = "/phaser-liq-token.png"

/** Por debajo de 1.00 PHASERLIQ el monitor puede ofrecer el faucet. */
export const PHASER_FAUCET_THRESHOLD_STROOPS = "10000000"

/** Cantidad que emite el faucet por solicitud (10.00 PHASERLIQ). */
export const PHASER_FAUCET_MINT_STROOPS = "100000000"

/** Precio x402 colección 0 (pool protocolo PHASE) — unidades mínimas PHASERLIQ */
export const REQUIRED_AMOUNT = "10000000"

export function balanceBelowFaucetThreshold(balanceStroops: string): boolean {
  try {
    return BigInt(balanceStroops || "0") < BigInt(PHASER_FAUCET_THRESHOLD_STROOPS)
  } catch {
    return parseInt(balanceStroops, 10) < parseInt(PHASER_FAUCET_THRESHOLD_STROOPS, 10)
  }
}

/**
 * Cuenta G en testnet con fondos, solo como fee source en simulaciones de lectura
 * (`get_collection`, `token_uri`, …). Override: `NEXT_PUBLIC_SOROBAN_SIM_ACCOUNT`.
 */
export const READONLY_SIM_SOURCE_G =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SOROBAN_SIM_ACCOUNT?.trim()
    ? process.env.NEXT_PUBLIC_SOROBAN_SIM_ACCOUNT.trim()
    : "GAVLW5IKB7VFBRJ3EHBE4BRZ5OX3AOW3ICMLMB6KVKCQDO6WJ2SPHDN3"

let _rpcServer: rpc.Server | null = null
function getRpc(): rpc.Server {
  if (!_rpcServer) _rpcServer = new rpc.Server(RPC_URL)
  return _rpcServer
}

function numLikeToNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === "bigint") return Number(v)
  if (typeof v === "string") return parseInt(v, 10) || 0
  return 0
}

function addressLikeToString(v: unknown): string {
  if (typeof v === "string") return v
  if (v != null && typeof v === "object" && "toString" in v) return String((v as { toString: () => string }).toString())
  return ""
}

/**
 * Simulación de solo lectura: cada llamada obtiene secuencia actual del fee source, arma un tx nuevo
 * y pide simulación al RPC (sin reutilizar footprint ni resultado de peticiones anteriores).
 */
async function simulateContractCall(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  feeSourceGAddress: string,
): Promise<unknown> {
  const server = getRpc()
  const acc = await server.getAccount(feeSourceGAddress)
  const c = new Contract(contractId)
  const tx = new TransactionBuilder(acc, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(c.call(method, ...args))
    .setTimeout(30)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error)
  }
  if (!sim.result?.retval) return null
  return scValToNative(sim.result.retval)
}

export type CollectionInfo = {
  collectionId: number
  creator: string
  name: string
  /** Unidades mínimas del token (string para i128) */
  price: string
  /** URL de arte en `token_uri` on-chain (puede estar vacío). */
  imageUri: string
}

/** Convierte cantidad LIQ humana (ej. 1 o 1.5) a stroops (7 decimales). */
export function liqToStroops(liq: string): string {
  const n = parseFloat(liq.replace(",", "."))
  if (Number.isNaN(n) || n <= 0) return "0"
  return Math.round(n * 10_000_000).toString()
}

export function stroopsToLiqDisplay(stroops: string): string {
  const v = parseInt(stroops, 10)
  if (Number.isNaN(v)) return "0.00"
  return (v / 10_000_000).toFixed(2)
}

export async function getAccountSequence(address: string): Promise<string> {
  const response = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(address)}`, {
    headers: { Accept: "application/json" },
  })
  if (response.status === 404) {
    throw new Error(
      "Account not found on Stellar testnet. Fund this address with test XLM (e.g. Friendbot) before signing transactions.",
    )
  }
  if (!response.ok) {
    const snippet = (await response.text()).slice(0, 240)
    throw new Error(`Horizon account lookup failed (${response.status}): ${snippet}`)
  }
  const data = (await response.json()) as { sequence?: string }
  if (data.sequence == null || data.sequence === "") {
    throw new Error("Horizon response missing account sequence.")
  }
  return data.sequence
}

export async function getTokenBalance(address: string): Promise<string> {
  try {
    const native = await simulateContractCall(
      TOKEN_ADDRESS,
      "balance",
      [Address.fromString(address).toScVal()],
      address,
    )
    if (native == null) return "0"
    if (typeof native === "bigint") return native.toString()
    if (typeof native === "number") return String(Math.trunc(native))
    return String(native)
  } catch {
    return "0"
  }
}

export async function buildInitiatePhaseTransaction(userAddress: string, collectionId: number = 0) {
  const server = getRpc()
  const account = await server.getAccount(userAddress)
  const c = new Contract(CONTRACT_ID)
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      c.call(
        "initiate_phase",
        Address.fromString(userAddress).toScVal(),
        Address.fromString(TOKEN_ADDRESS).toScVal(),
        nativeToScVal(collectionId, { type: "u64" }),
      ),
    )
    .setTimeout(30)
    .build()
  // prepareTransaction ejecuta simulateTransaction internamente y sobrescribe el footprint en este tx.
  const prepared = await server.prepareTransaction(tx)
  return prepared.toXDR()
}

export async function buildSettleTransaction(
  userAddress: string,
  amount: string,
  invoiceId: number,
  collectionId: number = 0,
) {
  const server = getRpc()
  const account = await server.getAccount(userAddress)
  const c = new Contract(CONTRACT_ID)
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      c.call(
        "settle",
        Address.fromString(userAddress).toScVal(),
        Address.fromString(TOKEN_ADDRESS).toScVal(),
        nativeToScVal(BigInt(amount), { type: "i128" }),
        nativeToScVal(invoiceId, { type: "u32" }),
        nativeToScVal(collectionId, { type: "u64" }),
      ),
    )
    .setTimeout(30)
    .build()
  const prepared = await server.prepareTransaction(tx)
  return prepared.toXDR()
}

/** Transfiere el NFT PHASE (`CONTRACT_ID`) al comprador. Requiere WASM desplegado con `transfer_phase_nft`. */
export async function buildTransferPhaseNftTransaction(
  fromAddress: string,
  toAddress: string,
  tokenId: number,
) {
  const server = getRpc()
  const account = await server.getAccount(fromAddress)
  const c = new Contract(CONTRACT_ID)
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      c.call(
        "transfer_phase_nft",
        Address.fromString(fromAddress).toScVal(),
        Address.fromString(toAddress).toScVal(),
        nativeToScVal(tokenId, { type: "u64" }),
      ),
    )
    .setTimeout(30)
    .build()
  const prepared = await server.prepareTransaction(tx)
  return prepared.toXDR()
}

function logSorobanRpcResultForDebug(context: string, result: unknown): void {
  if (typeof console === "undefined" || typeof console.log !== "function") return
  try {
    console.log(context, JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v)))
  } catch {
    console.log(context, result)
  }
}

export async function sendTransaction(signedXdr: string) {
  const server = getRpc()
  const parsed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET)
  const tx = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : (parsed as Transaction)
  const result = await server.sendTransaction(tx)
  if (result.status === "ERROR") {
    logSorobanRpcResultForDebug("[PHASE Soroban] sendTransaction ERROR (RPC result)", result)
    throw new Error("sendTransaction rejected by RPC (see errorResult on server)")
  }
  return result
}

export async function getTransactionResult(txHash: string): Promise<unknown> {
  const server = getRpc()
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const result = await server.getTransaction(txHash)
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return result
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      logSorobanRpcResultForDebug("[PHASE Soroban] getTransaction FAILED (RPC result)", result)
      throw new Error("Transaction failed on ledger")
    }
  }
  throw new Error("Transaction timeout")
}

export type PhaseArtifact = {
  tokenId: number
  energyLevelBp: number
}

function phaseArtifactFromNative(native: unknown): PhaseArtifact | null {
  if (native == null || typeof native !== "object") return null
  const o = native as Record<string, unknown>
  const tokenId = numLikeToNumber(o.token_id ?? o.tokenId)
  if (tokenId <= 0) return null
  const eb = o.energy_level_bp ?? o.energyLevelBp ?? 10_000
  const energyLevelBp = numLikeToNumber(eb) || 10_000
  return { tokenId, energyLevelBp }
}

function collectionInfoFromNative(native: unknown): CollectionInfo | null {
  if (native == null || typeof native !== "object") return null
  const o = native as Record<string, unknown>
  const collectionId = numLikeToNumber(o.collection_id ?? o.collectionId)
  const creator = addressLikeToString(o.creator)
  const name = typeof o.name === "string" ? o.name : String(o.name ?? "")
  const pr = o.price
  let price = "0"
  if (typeof pr === "bigint") price = pr.toString()
  else if (typeof pr === "number") price = String(Math.trunc(pr))
  else if (typeof pr === "string") price = pr
  const imageUri = typeof o.image_uri === "string" ? o.image_uri : String(o.image_uri ?? "")
  if (collectionId <= 0 && !creator && !name) return null
  return { collectionId, creator, name, price, imageUri }
}

function normalizeSymbolKey(key: unknown): string {
  if (!key || typeof key !== "object") return ""
  const k = key as Record<string, unknown>
  if (typeof k.symbol === "string") return k.symbol
  return ""
}

function parseNumericScVal(val: unknown): number | undefined {
  if (!val || typeof val !== "object") return undefined
  const v = val as Record<string, unknown>
  if (v.u64 != null) return parseInt(String(v.u64), 10)
  if (v.u32 != null) return parseInt(String(v.u32), 10)
  if (v.i128 && typeof v.i128 === "object") {
    const i = v.i128 as Record<string, string>
    if (i.lo != null) return parseInt(i.lo, 10)
  }
  return undefined
}

/** Interpreta el `retval` de `get_user_phase` (`Option<PhaseState>` → map de ScVal). */
export function parsePhaseStateRetval(retval: unknown): PhaseArtifact | null {
  const un = unwrapScVal(retval)
  if (un == null || typeof un !== "object") return null
  const root = un as Record<string, unknown>
  let map = root.map
  if (!Array.isArray(map) && root.ok && typeof root.ok === "object") {
    map = (root.ok as Record<string, unknown>).map
  }
  if (!Array.isArray(map)) return null

  let tokenId = 0
  let energyLevelBp = 10_000

  for (const raw of map) {
    if (!raw || typeof raw !== "object") continue
    const entry = raw as Record<string, unknown>
    const sym = normalizeSymbolKey(entry.key).toLowerCase().replace(/_/g, "")
    const num = parseNumericScVal(entry.val)
    if (num == null || Number.isNaN(num)) continue

    if (sym === "tokenid" || sym === "phaseid") {
      tokenId = Math.max(tokenId, num)
    }
    if (sym === "energylevelbp" || sym === "energy") {
      energyLevelBp = num
    }
  }

  if (tokenId <= 0) {
    const legacy = map[0] as Record<string, unknown> | undefined
    const fallback = parseNumericScVal(legacy?.val ?? legacy)
    if (fallback != null && fallback > 0) {
      return { tokenId: fallback, energyLevelBp: 10_000 }
    }
    return null
  }

  return { tokenId, energyLevelBp }
}

function parseScString(val: unknown): string {
  if (typeof val === "string") return val
  if (!val || typeof val !== "object") return ""
  const v = val as Record<string, unknown>
  if (typeof v.string === "string") return v.string
  if (typeof v.str === "string") return v.str
  return ""
}

function parseScAddress(val: unknown): string {
  if (!val || typeof val !== "object") return ""
  const v = val as Record<string, unknown>
  if (typeof v.address === "string") return v.address
  return ""
}

function parseI128String(val: unknown): string {
  if (!val || typeof val !== "object") return "0"
  const v = val as Record<string, unknown>
  if (typeof v.i128 === "string") return v.i128
  if (v.i128 && typeof v.i128 === "object") {
    const i = v.i128 as Record<string, string>
    if (i.lo != null) return i.lo
  }
  return "0"
}

/** Desenveleva Option / envoltorios comunes del JSON-RPC de Soroban. */
function unwrapScVal(val: unknown, depth = 0): unknown {
  if (val == null || depth > 12) return val
  if (typeof val !== "object") return val
  const o = val as Record<string, unknown>
  if (Array.isArray(o.map)) return val
  if (o.ok !== undefined && o.ok !== null) return unwrapScVal(o.ok, depth + 1)
  if (o.some !== undefined && o.some !== null) return unwrapScVal(o.some, depth + 1)
  if (Array.isArray(o.vec) && o.vec.length === 1) return unwrapScVal(o.vec[0], depth + 1)
  if (o._value !== undefined) return unwrapScVal(o._value, depth + 1)
  return val
}

function findFirstStructMap(val: unknown, depth = 0): Array<Record<string, unknown>> | null {
  if (depth > 14 || val == null) return null
  const u = unwrapScVal(val)
  if (typeof u !== "object" || u == null) return null
  const o = u as Record<string, unknown>
  if (Array.isArray(o.map) && o.map.length > 0) {
    const first = o.map[0] as Record<string, unknown> | undefined
    const sym = normalizeSymbolKey(first?.key).toLowerCase().replace(/_/g, "")
    if (
      sym.includes("collection") ||
      sym.includes("creator") ||
      sym.includes("price") ||
      sym === "name" ||
      sym.includes("image")
    ) {
      return o.map as Array<Record<string, unknown>>
    }
  }
  for (const k of Object.keys(o)) {
    const inner = findFirstStructMap(o[k], depth + 1)
    if (inner) return inner
  }
  return null
}

/** Interpreta `get_collection` → `Option<CollectionSettings>`. */
export function parseCollectionSettingsRetval(retval: unknown): CollectionInfo | null {
  const u = unwrapScVal(retval)
  if (u === null || u === undefined) return null
  if (typeof u === "string" && u === "") return null
  const map = findFirstStructMap(u)
  if (!map) return null

  let collectionId = 0
  let creator = ""
  let name = ""
  let price = "0"
  let imageUri = ""

  for (const raw of map) {
    if (!raw || typeof raw !== "object") continue
    const entry = raw as Record<string, unknown>
    const sym = normalizeSymbolKey(entry.key).toLowerCase().replace(/_/g, "")
    const val = entry.val

    if (sym === "collectionid") {
      const n = parseNumericScVal(val)
      if (n != null) collectionId = n
    } else if (sym === "creator") {
      creator = parseScAddress(val)
    } else if (sym === "name") {
      name = parseScString(val)
    } else if (sym === "price") {
      price = parseI128String(val)
    } else if (sym === "imageuri" || sym === "image") {
      imageUri = parseScString(val)
    }
  }

  if (collectionId <= 0 && !creator && !name) return null
  return { collectionId, creator, name, price, imageUri }
}

/** Mensajes localizables para validación de URI de imagen on-chain. */
export type ImageUriValidationMessages = {
  maxLen: string
  control: string
  quotes: string
  mustHttpsOrIpfs: string
  ipfsCidShort: string
}

export const DEFAULT_IMAGE_URI_VALIDATION: ImageUriValidationMessages = {
  maxLen: "Image URL must be at most 256 characters.",
  control: "Image URL cannot contain control characters.",
  quotes: "Image URL cannot contain \" or \\ (on-chain JSON).",
  mustHttpsOrIpfs: "On-chain image must be https://… or ipfs://…",
  ipfsCidShort: "Invalid ipfs:// URI (CID too short).",
}

/** Coincide con validación on-chain: sin comillas, backslash ni control chars; longitud máx. */
export function validateCollectionImageUri(
  raw: string,
  msg: ImageUriValidationMessages = DEFAULT_IMAGE_URI_VALIDATION,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = raw.trim()
  if (value.length > 256) return { ok: false, message: msg.maxLen }
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (c < 32) return { ok: false, message: msg.control }
    if (value[i] === '"' || value[i] === "\\") return { ok: false, message: msg.quotes }
  }
  return { ok: true, value }
}

/**
 * URI final para el contrato: vacío permitido; si no vacío debe ser `https://…` o `ipfs://…`
 * (tras pasar las reglas on-chain de `validateCollectionImageUri`).
 */
export function validateFinalContractImageUri(
  raw: string,
  msg: ImageUriValidationMessages = DEFAULT_IMAGE_URI_VALIDATION,
): { ok: true; value: string } | { ok: false; message: string } {
  const base = validateCollectionImageUri(raw, msg)
  if (!base.ok) return base
  if (base.value === "") return base
  const v = base.value
  const https = /^https:\/\//i.test(v)
  const ipfs = /^ipfs:\/\//i.test(v)
  if (!https && !ipfs) {
    return { ok: false, message: msg.mustHttpsOrIpfs }
  }
  if (ipfs) {
    const path = v.slice(7).replace(/^\/+/, "")
    if (path.length < 4) return { ok: false, message: msg.ipfsCidShort }
  }
  return base
}

/** Vista previa en `<img>`: convierte `ipfs://CID/...` a gateway HTTPS. */
export function ipfsOrHttpsDisplayUrl(uri: string): string {
  const t = uri.trim()
  if (!t) return ""
  if (/^ipfs:\/\//i.test(t)) {
    const path = t.replace(/^ipfs:\/\//i, "").replace(/^\/+/, "")
    return `https://ipfs.io/ipfs/${path}`
  }
  return t
}

export async function fetchTotalCollections(): Promise<number> {
  try {
    const native = await simulateContractCall(CONTRACT_ID, "get_total_collections", [], READONLY_SIM_SOURCE_G)
    const n = numLikeToNumber(native)
    return Math.max(0, n)
  } catch {
    return 0
  }
}

/** Debe coincidir con `get_collection_supply_cap` en el contrato PHASE (10_000). */
export const PHASE_COLLECTION_SUPPLY_CAP = 10_000

/**
 * `get_total_minted(collection_id)` + tope de escasez (`get_collection_supply_cap` o constante si el WASM aún no está actualizado).
 */
export async function fetchCollectionSupply(collectionId: number): Promise<{ minted: number; cap: number } | null> {
  if (collectionId < 0) return null
  try {
    const mintedNative = await simulateContractCall(
      CONTRACT_ID,
      "get_total_minted",
      [nativeToScVal(collectionId, { type: "u64" })],
      READONLY_SIM_SOURCE_G,
    )
    let cap = PHASE_COLLECTION_SUPPLY_CAP
    try {
      const capNative = await simulateContractCall(
        CONTRACT_ID,
        "get_collection_supply_cap",
        [nativeToScVal(collectionId, { type: "u64" })],
        READONLY_SIM_SOURCE_G,
      )
      const c = numLikeToNumber(capNative)
      if (c > 0) cap = c
    } catch {
      /* contrato sin getter: constante */
    }
    const minted = Math.max(0, numLikeToNumber(mintedNative))
    return { minted, cap }
  } catch {
    return null
  }
}

/** Colecciones `1..N` según `get_total_collections` (omite entradas vacías). */
export async function fetchCollectionsCatalog(): Promise<CollectionInfo[]> {
  const total = await fetchTotalCollections()
  const out: CollectionInfo[] = []
  for (let id = 1; id <= total; id++) {
    const info = await fetchCollectionInfo(id)
    if (info && info.collectionId > 0) out.push(info)
  }
  return out
}

export function parseTokenUriMetadata(json: string): { image?: string; name?: string } {
  try {
    const o = JSON.parse(json) as Record<string, unknown>
    const image = typeof o.image === "string" ? o.image : undefined
    const name = typeof o.name === "string" ? o.name : undefined
    return { image, name }
  } catch {
    return {}
  }
}

export async function fetchTokenUriString(tokenId: number): Promise<string | null> {
  if (tokenId <= 0) return null
  try {
    const native = await simulateContractCall(
      CONTRACT_ID,
      "token_uri",
      [nativeToScVal(tokenId, { type: "u64" })],
      READONLY_SIM_SOURCE_G,
    )
    if (native == null) return null
    const s = typeof native === "string" ? native : String(native)
    return s.length > 0 ? s : null
  } catch {
    return null
  }
}

export async function fetchCreatorCollectionId(creatorAddress: string): Promise<number | null> {
  try {
    const native = await simulateContractCall(
      CONTRACT_ID,
      "get_creator_collection_id",
      [Address.fromString(creatorAddress).toScVal()],
      creatorAddress,
    )
    if (native == null) return null
    const n = numLikeToNumber(native)
    return n > 0 ? n : null
  } catch {
    return null
  }
}

export async function fetchCollectionInfo(collectionId: number): Promise<CollectionInfo | null> {
  if (collectionId <= 0) return null
  try {
    const native = await simulateContractCall(
      CONTRACT_ID,
      "get_collection",
      [nativeToScVal(collectionId, { type: "u64" })],
      READONLY_SIM_SOURCE_G,
    )
    return collectionInfoFromNative(native)
  } catch {
    return null
  }
}

export async function buildCreateCollectionTransaction(
  creatorAddress: string,
  name: string,
  priceStroops: string,
  imageUri: string,
) {
  const server = getRpc()
  const account = await server.getAccount(creatorAddress)
  const c = new Contract(CONTRACT_ID)
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      c.call(
        "create_collection",
        Address.fromString(creatorAddress).toScVal(),
        nativeToScVal(name, { type: "string" }),
        nativeToScVal(BigInt(priceStroops), { type: "i128" }),
        nativeToScVal(imageUri, { type: "string" }),
      ),
    )
    .setTimeout(30)
    .build()
  const prepared = await server.prepareTransaction(tx)
  return prepared.toXDR()
}

export async function fetchUserPhaseArtifact(
  userAddress: string,
  collectionId: number = 0,
): Promise<PhaseArtifact | null> {
  try {
    const native = await simulateContractCall(
      CONTRACT_ID,
      "get_user_phase",
      [Address.fromString(userAddress).toScVal(), nativeToScVal(collectionId, { type: "u64" })],
      userAddress,
    )
    return phaseArtifactFromNative(native)
  } catch {
    return null
  }
}

export async function checkHasPhased(
  userAddress: string,
  collectionId: number = 0,
): Promise<{ phased: boolean; phaseId?: number; energyLevelBp?: number }> {
  const art = await fetchUserPhaseArtifact(userAddress, collectionId)
  if (!art || art.tokenId <= 0) return { phased: false }
  return { phased: true, phaseId: art.tokenId, energyLevelBp: art.energyLevelBp }
}

/**
 * Escaneo defensivo para detectar propiedad real de cualquier NFT PHASE,
 * incluso fuera de `collection_id=0` o de la colección creada por el usuario.
 */
export async function userOwnsAnyPhaseToken(userAddress: string, scanWindow: number = 400): Promise<boolean> {
  const normalized = userAddress.trim().toUpperCase()
  if (!normalized) return false
  try {
    const totalNative = await simulateContractCall(CONTRACT_ID, "total_supply", [], READONLY_SIM_SOURCE_G)
    const total = Math.max(0, numLikeToNumber(totalNative))
    if (total <= 0) return false

    const from = Math.max(1, total - Math.max(1, scanWindow) + 1)
    for (let tokenId = total; tokenId >= from; tokenId--) {
      const owner = await fetchTokenOwnerAddress(CONTRACT_ID, tokenId)
      if (owner && owner.trim().toUpperCase() === normalized) return true
    }
    return false
  } catch {
    return false
  }
}

function extractAccountGAddress(value: unknown, depth = 0): string | null {
  if (value == null || depth > 6) return null

  if (typeof value === "string") {
    const t = value.trim().toUpperCase()
    const direct = t.match(/\bG[A-Z2-7]{55}\b/)
    return direct ? direct[0] : null
  }

  if (value instanceof Uint8Array && value.byteLength === 32) {
    try {
      return StrKey.encodeEd25519PublicKey(Buffer.from(value))
    } catch {
      return null
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractAccountGAddress(item, depth + 1)
      if (found) return found
    }
    return null
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>

    // Common native shapes returned by Soroban SDK wrappers.
    const directKeys = ["address", "account", "accountId", "owner", "ownerAddress", "value"]
    for (const k of directKeys) {
      if (k in obj) {
        const found = extractAccountGAddress(obj[k], depth + 1)
        if (found) return found
      }
    }

    for (const v of Object.values(obj)) {
      const found = extractAccountGAddress(v, depth + 1)
      if (found) return found
    }

    if (typeof obj.toString === "function") {
      const fromToString = extractAccountGAddress(String(obj.toString()), depth + 1)
      if (fromToString) return fromToString
    }
  }

  return null
}

function parseOwnerOfReturn(native: unknown): string | null {
  return extractAccountGAddress(native)
}

/** `owner_of` on-chain → dirección G o `null` si el token no existe / simulación falla. */
export async function fetchTokenOwnerAddress(
  contractId: string,
  tokenId: number,
): Promise<string | null> {
  if (!Number.isFinite(tokenId) || tokenId <= 0) return null
  try {
    const native = await simulateContractCall(
      contractId,
      "owner_of",
      [nativeToScVal(tokenId, { type: "u64" })],
      READONLY_SIM_SOURCE_G,
    )
    return parseOwnerOfReturn(native)
  } catch {
    return null
  }
}

/** Símbolo del token leído on-chain (`symbol()` o fallback `token_symbol()`). */
export async function fetchTokenSymbol(contractId: string = TOKEN_ADDRESS): Promise<string> {
  try {
    const direct = await simulateContractCall(contractId, "symbol", [], READONLY_SIM_SOURCE_G)
    if (typeof direct === "string" && direct.trim().length > 0) return direct.trim()
  } catch {
    /* fallback below */
  }
  try {
    const legacy = await simulateContractCall(contractId, "token_symbol", [], READONLY_SIM_SOURCE_G)
    if (typeof legacy === "string" && legacy.trim().length > 0) return legacy.trim()
  } catch {
    /* fallback below */
  }
  return PHASER_LIQ_SYMBOL
}

/**
 * Verificación de originalidad: la wallet activa coincide con `TokenOwner(token_id)` en el contrato.
 */
export function isAuthentic(
  viewerAddress: string | null | undefined,
  onChainOwnerAddress: string | null | undefined,
): boolean {
  const v = viewerAddress?.trim().toUpperCase()
  const o = onChainOwnerAddress?.trim().toUpperCase()
  if (!v || !o) return false
  return v === o
}

export function formatLiq(balance: string) {
  const num = parseInt(balance, 10) / 10000000
  return num.toFixed(2)
}

export function isLowEnergy(tokenBalance: string, requiredStroops: string = REQUIRED_AMOUNT) {
  try {
    return BigInt(tokenBalance || "0") < BigInt(requiredStroops || "0")
  } catch {
    return parseInt(tokenBalance, 10) < parseInt(requiredStroops, 10)
  }
}

/** On-chain `PhaseError::InsufficientBalance` (discriminant 2) as reported by the host. */
export function isPhaseInsufficientBalanceError(message: string) {
  return /Error\s*\(\s*Contract\s*,\s*#2\s*\)/.test(message) || /\bContract\s*,\s*#2\b/.test(message)
}

/** On-chain `PhaseError::CreatorAlreadyHasCollection` (discriminant 8). */
export function isCreatorAlreadyHasCollectionError(message: string) {
  return /Error\s*\(\s*Contract\s*,\s*#8\s*\)/.test(message) || /\bContract\s*,\s*#8\b/.test(message)
}

/** On-chain unauthorized gate (commonly surfaced as `Contract, #13` / "Unauthorized"). */
export function isPhaseUnauthorizedError(message: string) {
  const m = message.toLowerCase()
  return /Error\s*\(\s*Contract\s*,\s*#13\s*\)/.test(message) || /\bContract\s*,\s*#13\b/.test(message) || m.includes("unauthorized")
}

/** Detect RPC / sequence class errors for narrative recovery UI */
export function isStellarDesyncError(message: string) {
  const m = message.toLowerCase()
  return (
    m.includes("sequence") ||
    m.includes("getaccount") ||
    m.includes("get account") ||
    m.includes("rpc") ||
    m.includes("network") ||
    m.includes("fetch") ||
    m.includes("failed to get account") ||
    m.includes("method not found")
  )
}
