# PHASERLIQ Rewards API and Operations

Related docs:
- [`README.md`](../README.md)
- [`PROJECT_ARCHITECTURE.md`](../PROJECT_ARCHITECTURE.md)
- [`docs/TECHNICAL.md`](./TECHNICAL.md)

---

## ES — Documentación operativa

### Objetivo

Definir el comportamiento del motor de recompensas testnet para PHASERLIQ, incluyendo reglas funcionales, contratos API y secuencia trustline-first.

### Tipos de recompensa

- `genesis`: bootstrap inicial (una vez por wallet).
- `daily`: recarga periódica (cooldown de 24h).
- `quest_connect_wallet`
- `quest_first_collection`
- `quest_first_settle`

### Endpoints

#### `GET /api/faucet?walletAddress=G...`

Devuelve estado global y por reward:

- `enabled`
- `questOverview`
- `rewards[*].claimable`
- `rewards[*].claimedAt`
- `rewards[*].nextAt`
- `rewards[*].amountStroops`
- `rewards[*].requirementMet`, `progressPct`, `requirementText` (quests)

#### `POST /api/faucet`

Body:

```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXX",
  "reward": "daily"
}
```

Respuesta exitosa:

```json
{
  "ok": true,
  "hash": "tx_hash_here",
  "reward": "daily",
  "amountStroops": "20000000"
}
```

Errores esperados:

- `409`: recompensa one-time ya reclamada.
- `429`: cooldown activo (`daily`).
- `412`: requisito quest no cumplido.
- `503`: faucet no configurado.

### Ruta de compatibilidad

`POST /api/claim-bounty` reutiliza la semántica de `POST /api/faucet` y devuelve el mismo contrato de respuesta.

### Flujo trustline-first

Si hay activo clásico configurado en servidor:

1. UI consulta `GET /api/classic-liq`.
2. Si no existe trustline, construye `changeTrust` y pide firma en Freighter.
3. UI envía XDR firmado a `POST /api/classic-liq/trustline`.
4. Solo después ejecuta `POST /api/faucet` (o `POST /api/claim-bounty`).

Esto evita fallos por intentos de acreditar fondos a wallets sin trustline.

---

## EN — Operational documentation

### Purpose

Define the PHASERLIQ testnet reward engine behavior, API contracts, and trustline-first execution model.

### Reward types

- `genesis` (one-time bootstrap)
- `daily` (24h cooldown)
- `quest_connect_wallet`
- `quest_first_collection`
- `quest_first_settle`

### Endpoints

#### `GET /api/faucet?walletAddress=G...`

Returns global and per-reward status:

- `enabled`
- `questOverview`
- `rewards[*].claimable`
- `rewards[*].claimedAt`
- `rewards[*].nextAt`
- `rewards[*].amountStroops`
- quest requirements/progress fields where applicable

#### `POST /api/faucet`

Request body:

```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXX",
  "reward": "quest_first_collection"
}
```

Successful response:

```json
{
  "ok": true,
  "hash": "tx_hash_here",
  "reward": "quest_first_collection",
  "amountStroops": "30000000"
}
```

Common status codes:

- `409`: already claimed one-time reward.
- `429`: cooldown still active.
- `412`: quest prerequisite not met.
- `503`: faucet unavailable/misconfigured.

### Compatibility route

`POST /api/claim-bounty` is a typed compatibility route that forwards to `/api/faucet` semantics.

### Trustline-first execution

When classic asset mode is enabled:

1. UI checks wallet/asset status via `/api/classic-liq`.
2. Missing trustline triggers signed `changeTrust`.
3. Signed XDR is posted to `/api/classic-liq/trustline`.
4. Reward claim is executed only after trustline readiness.

This prevents failed funding attempts for wallets that cannot yet receive the classic asset.
