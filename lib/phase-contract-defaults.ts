/**
 * Token de liquidez testnet (código + emisor) y contratos Soroban por defecto.
 * El SAC (C…) se deriva con el SDK para que coincida con `Asset(code, issuer).contractId(TESTNET)`.
 *
 * Si desplegás un nuevo contrato PHASE (NFT) con otro `AuthorizedToken`, actualizá
 * `DEFAULT_PHASE_CONTRACT` o `NEXT_PUBLIC_PHASE_PROTOCOL_ID`.
 */
import { Asset, Networks } from "@stellar/stellar-sdk"

/** Código del asset clásico / símbolo UI (evita colisión con un PHASERLIQ legacy en Freighter). */
export const DEFAULT_LIQUIDITY_ASSET_CODE = "PHASELQ"

export const DEFAULT_LIQUIDITY_ISSUER =
  "GD7VAD4VDVHASKZIJPRORMXLML4RSVLRANYNRCCBWLO5ACOSYQZBSUFI"

export const DEFAULT_TOKEN_CONTRACT = new Asset(
  DEFAULT_LIQUIDITY_ASSET_CODE,
  DEFAULT_LIQUIDITY_ISSUER,
).contractId(Networks.TESTNET)

/** Contrato PHASE (NFT); debe estar inicializado con `AuthorizedToken` = `DEFAULT_TOKEN_CONTRACT` (o override en env). */
export const DEFAULT_PHASE_CONTRACT = "CBBCEDZ747IC3V4TWWCVGP33V74QM5T3MCPZV7DQ7CB6MA66YNWAC3DX"
