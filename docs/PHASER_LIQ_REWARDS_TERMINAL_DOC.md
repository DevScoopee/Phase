# PHASER_LIQ // TERMINAL REWARDS DOC

**Índice del proyecto:** [README.md](../README.md) · **Documentación integrada (UI):** `/docs` en la app · **Contratos:** [contracts/README.md](../contracts/README.md)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE PROTOCOL :: TESTNET REWARDS ENGINE                                   │
│ MODULE: PHASER_LIQ EARNING LOOP                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## ES - Documentacion Operativa

```text
[ RESUMEN ]
Sistema de recompensas para testnet con 3 vias:
1) GENESIS SUPPLY (1 vez por wallet)
2) DAILY RECHARGE (cada 24h por wallet)
3) QUEST REWARDS (1 vez por mision)
```

### Reglas

- `genesis`: entrega inicial para bootstrap de cuenta nueva.
- `daily`: recarga con ventana de `24h` entre reclamos.
- `quests`: cada quest se reclama una sola vez por wallet y ahora valida condición real on-chain:
  - `quest_connect_wallet`
  - `quest_first_collection` -> requiere colección creada por la wallet (`get_creator_collection_id`)
  - `quest_first_settle` -> requiere al menos un phase/settlement (`get_user_phase`)

### API

```text
GET  /api/faucet
GET  /api/faucet?walletAddress=G...
POST /api/faucet
```

### GET /api/faucet?walletAddress=G...

- Devuelve `enabled` y estado por reward:
  - `claimable`
  - `claimedAt`
  - `nextAt`
  - `amountStroops`
  - `requirementMet` / `progressPct` / `requirementText` (quests)
- Incluye `questOverview` agregado para barra de progreso global.

Ejemplo rapido:

```json
{
  "enabled": true,
  "wallet": "GXXXXXXXXXXXXXXXXXXXXXXXX",
  "dailyWindowMs": 86400000,
  "questOverview": { "completed": 1, "total": 3, "progressPct": 33 },
  "rewards": {
    "genesis": { "claimable": false, "claimedAt": 1712345678901, "nextAt": null, "amountStroops": "100000000" },
    "daily": { "claimable": true, "claimedAt": 1712345000000, "nextAt": null, "amountStroops": "20000000" },
    "quest_connect_wallet": {
      "claimable": true,
      "claimedAt": null,
      "nextAt": null,
      "amountStroops": "30000000",
      "requirementMet": true,
      "progressPct": 100,
      "requirementText": "Connect wallet is required."
    }
  }
}
```

### POST /api/faucet

Body:

```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXX",
  "reward": "daily"
}
```

- `reward` soportados:
  - `genesis`
  - `daily`
  - `quest_connect_wallet`
  - `quest_first_collection`
  - `quest_first_settle`

Respuesta exitosa:

```json
{
  "ok": true,
  "hash": "tx_hash_here",
  "reward": "daily",
  "amountStroops": "20000000"
}
```

Errores comunes:

- `409`: reward ya reclamado (one-time).
- `429`: reward en cooldown (daily).
- `412`: requisito de quest no cumplido (on-chain).
- `503`: faucet no configurado (falta `ADMIN_SECRET_KEY`).

### UI: Panel de obtencion

```text
[ FORMAS_DE_CONSEGUIR_PHASER_LIQ ]
  > GENESIS SUPPLY
  > DAILY RECHARGE
  > QUEST #1 CONNECT
  > QUEST #2 COLLECTION
  > QUEST #3 SETTLEMENT
```

- El panel muestra estado en tiempo real: `READY`, `LOCKED`, `CLAIMED`, `RESET @ ...`.
- Cada quest renderiza barra de progreso (`progressPct`) + texto de requisito.
- Cada claim deja traza en logs del chamber.
- Recompensa acreditada muestra toast con icono de token.

---

## EN - Operational Documentation

```text
[ SUMMARY ]
Testnet earning engine with 3 acquisition paths:
1) GENESIS SUPPLY (one-time per wallet)
2) DAILY RECHARGE (every 24h per wallet)
3) QUEST REWARDS (one-time per mission)
```

### Rules

- `genesis`: initial bootstrap for a new wallet.
- `daily`: rechargeable reward with `24h` cooldown.
- `quests`: each quest is one-time per wallet and now requires real on-chain proof:
  - `quest_connect_wallet`
  - `quest_first_collection` -> requires creator collection (`get_creator_collection_id`)
  - `quest_first_settle` -> requires at least one phase/settlement (`get_user_phase`)

### API

```text
GET  /api/faucet
GET  /api/faucet?walletAddress=G...
POST /api/faucet
```

### GET /api/faucet?walletAddress=G...

- Returns `enabled` and reward status:
  - `claimable`
  - `claimedAt`
  - `nextAt`
  - `amountStroops`
  - `requirementMet` / `progressPct` / `requirementText` (quests)
- Also includes `questOverview` for a global quest progress bar.

### POST /api/faucet

Body:

```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXX",
  "reward": "quest_first_collection"
}
```

Supported `reward` values:

- `genesis`
- `daily`
- `quest_connect_wallet`
- `quest_first_collection`
- `quest_first_settle`

Success response:

```json
{
  "ok": true,
  "hash": "tx_hash_here",
  "reward": "quest_first_collection",
  "amountStroops": "30000000"
}
```

Common error codes:

- `409`: already claimed reward.
- `429`: cooldown active (daily).
- `412`: quest requirement not satisfied (on-chain check).
- `503`: faucet not configured (`ADMIN_SECRET_KEY` missing).

### UI: Earning panel

```text
[ WAYS_TO_EARN_PHASER_LIQ ]
  > GENESIS SUPPLY
  > DAILY RECHARGE
  > QUEST #1 CONNECT
  > QUEST #2 COLLECTION
  > QUEST #3 SETTLEMENT
```

- Live reward state labels: `READY`, `LOCKED`, `CLAIMED`, `RESET @ ...`.
- Each quest card renders progress bars from `progressPct`.
- Claims write narrative logs in the chamber.
- Successful claim shows token-icon toast feedback.

```text
END_OF_DOC :: PHASER_LIQ_REWARDS_TERMINAL_DOC
```
