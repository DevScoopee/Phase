# PHASE Protocol - Contratos Soroban

Este directorio contiene los contratos inteligentes del protocolo PHASE para Stellar/Soroban.

## Referencia desplegada (testnet, valores por defecto del repo)

Estos IDs coinciden con `lib/phase-protocol.ts` en la app Next.js. Si redespliegas, actualiza `.env.local` y la documentación.

| Contrato | Contract ID | Stellar Expert |
|----------|-------------|----------------|
| **phase-protocol** (núcleo) | `CAZKRXQWXKM4UNDB5FY4XVMWDKKZJ2EFKMNFCFH3WC7SHE7RCO7HOR6L` | [Ver ↗](https://stellar.expert/explorer/testnet/contract/CAZKRXQWXKM4UNDB5FY4XVMWDKKZJ2EFKMNFCFH3WC7SHE7RCO7HOR6L) |
| **PHASELQ** (SAC; default app `TOKEN_ADDRESS`) | `CCKTFAHWI3MREYMDBFF4VB5ZPIIRVZH6LYYYYW34F6NZU54N2C3MHWBZ` | [Stellar Expert (asset) ↗](https://stellar.expert/explorer/testnet/asset/PHASELQ-GD7VAD4VDVHASKZIJPRORMXLML4RSVLRANYNRCCBWLO5ACOSYQZBSUFI) |
| **PHASERLIQ** (SAC legacy, emisor GAXR…) | `CDOAXHWC6YJB7U3ELV67HKJY6HEMJFBNRGJK6WZGUAELBWP3WP77RLFD` | [Asset legado ↗](https://stellar.expert/explorer/testnet/asset/PHASERLIQ-GAXRPE5JXPY7RJONMCEWFXELVWDW3CSA7H6LAGYKTOYLFQQDJ5DT4GNS) |

- Red: **testnet** · Passphrase: `Test SDF Network ; September 2015`
- Documentación de producto: [README.md](../README.md) · Guía in-app: ruta `/docs` · Recompensas: [docs/PHASER_LIQ_REWARDS_TERMINAL_DOC.md](../docs/PHASER_LIQ_REWARDS_TERMINAL_DOC.md)

## Estructura

```
contracts/
├── phase-protocol/     # Contrato principal de PHASE
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs
├── mock-token/         # Token SEP-41 de prueba
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs
└── README.md          # Este archivo
```

## Requisitos Previos

1. **Rust instalado** con target WebAssembly:
```bash
rustup target add wasm32-unknown-unknown
```

2. **Stellar CLI** instalado:
```bash
cargo install --locked stellar-cli
```

3. **Configurar Stellar CLI para Testnet**:
```bash
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

4. **Configurar identidad** (tu cuenta de Freighter en Testnet):
```bash
# Opción A: Usar tu wallet de Freighter
# Copia tu public key de Freighter y úsalo en los comandos con --source

# Opción B: Crear una identidad local para testing
stellar keys generate --global phase-deployer --network testnet
stellar keys fund --source phase-deployer --network testnet
```

## Comandos de Build y Deploy

### 0. Atajo recomendado: deploy + `initialize` (script del repo)

Tras los pasos **1 (compilar)** y **2 (optimizar)** de `phase-protocol`, puedes desplegar una **instancia nueva** y llamar a `initialize` sin copiar comandos largos:

```bash
# Desde la raíz del monorepo (no dentro de contracts/)
npm run deploy:phase-sep50
```

Requiere `.env.local` con `ADMIN_SECRET_KEY`, `NEXT_PUBLIC_PHASER_TOKEN_ID` (SAC PHASELQ `C…`) y `NEXT_PUBLIC_CLASSIC_LIQ_ISSUER` (`G…` tesorería). Opcional: `REQUIRED_AMOUNT` (por defecto `10000000` = 1.0 unidad con 7 decimales). El script actualiza `lib/phase-contract-defaults.ts` y las variables `NEXT_PUBLIC_PHASE_PROTOCOL_ID` / `PHASE_PROTOCOL_ID` en `.env.local`.

**Nota:** Cada deploy crea un **contrato `C…` nuevo**. Los NFT del despliegue anterior siguen en el contrato viejo. Este WASM **no** está documentado como *upgradeable*; `stellar contract install` solo sube bytes WASM al ledger — **no sustituye** la lógica de una instancia ya desplegada salvo que el contrato exponga flujo de upgrade explícito.

### 1. Compilar Contratos

```bash
# Ir al directorio de contratos
cd contracts/

# Compilar Mock Token
cd mock-token
cargo build --target wasm32-unknown-unknown --release
# El archivo se genera en: target/wasm32-unknown-unknown/release/mock_token.wasm

# Compilar Phase Protocol
cd ../phase-protocol
cargo build --target wasm32-unknown-unknown --release
# El archivo se genera en: target/wasm32-unknown-unknown/release/phase_protocol.wasm
```

### 2. Optimizar WASM

```bash
# Optimizar Mock Token (reduce tamaño significativamente)
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/mock_token.wasm \
  --wasm-out target/wasm32-unknown-unknown/release/mock_token.optimized.wasm

# Optimizar Phase Protocol
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/phase_protocol.wasm \
  --wasm-out target/wasm32-unknown-unknown/release/phase_protocol.optimized.wasm
```

### 3. Desplegar a Testnet

En **Stellar CLI 25+** conviene fijar RPC y passphrase (o exportar `STELLAR_RPC_URL` y `STELLAR_NETWORK_PASSPHRASE`). `--source-account` acepta identidad, `G…` o clave secreta `S…` (mejor usar identidad / variable de entorno, no pegar secretos en el historial).

```bash
RPC="https://soroban-testnet.stellar.org"
PASS="Test SDF Network ; September 2015"

# Desplegar Mock Token (desde contracts/mock-token/)
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/mock_token.optimized.wasm \
  --source-account TU_CUENTA_O_IDENTIDAD \
  --network testnet \
  --rpc-url "$RPC" \
  --network-passphrase "$PASS"

# Guarda el contract ID (ej: CABC…1234) → MOCK_TOKEN_ID

# Desplegar Phase Protocol (desde contracts/phase-protocol/)
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/phase_protocol.optimized.wasm \
  --source-account TU_CUENTA_O_IDENTIDAD \
  --network testnet \
  --rpc-url "$RPC" \
  --network-passphrase "$PASS"

# Guarda el contract ID → PHASE_PROTOCOL_ID
```

### 4. Inicializar Contratos

```bash
RPC="https://soroban-testnet.stellar.org"
PASS="Test SDF Network ; September 2015"

# Inicializar Mock Token
stellar contract invoke \
  --id MOCK_TOKEN_ID \
  --source-account TU_CUENTA_O_IDENTIDAD \
  --network testnet \
  --rpc-url "$RPC" \
  --network-passphrase "$PASS" \
  -- \
  initialize \
  --admin TU_ADDRESS_G \
  --decimals 7 \
  --name "Mock Test Token" \
  --symbol "MOCK"

# Inicializar Phase Protocol (tesorería = G… que recibe el 5% en settles con creador)
stellar contract invoke \
  --id PHASE_PROTOCOL_ID \
  --source-account TU_CUENTA_O_IDENTIDAD \
  --network testnet \
  --rpc-url "$RPC" \
  --network-passphrase "$PASS" \
  -- \
  initialize \
  --admin TU_ADDRESS_G \
  --token_address SAC_PHASELQ_C_O_MOCK_TOKEN_ID \
  --required_amount 10000000 \
  --protocol_treasury TU_TESORERIA_G
# 10000000 = 1.0 PHASELQ si el token usa 7 decimales (no uses 1000000 salvo que quieras 0.1)
```

### 4b. URL embebida de metadata (`token_uri`)

La base HTTPS que el contrato concatena con el `token_id` se fija **al compilar** con la variable de entorno opcional `PHASE_METADATA_BASE_URL` (debe terminar en `/`). Si no existe, el default es `https://www.phasee.xyz/api/metadata/`. Recompilá, optimizá y **desplegá una instancia nueva** tras cambiarla (o `npm run deploy:phase-sep50`).

**Ejemplo ngrok:**

```bash
export PHASE_METADATA_BASE_URL="https://TU_SUBDOMINIO.ngrok-free.app/api/metadata/"
cd contracts/phase-protocol
cargo build --target wasm32-unknown-unknown --release
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/phase_protocol.wasm \
  --wasm-out target/wasm32-unknown-unknown/release/phase_protocol.optimized.wasm
```

**Deploy a testnet (WASM optimizado):**

```bash
RPC="https://soroban-testnet.stellar.org"
PASS="Test SDF Network ; September 2015"

cd contracts/phase-protocol
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/phase_protocol.optimized.wasm \
  --source-account TU_IDENTIDAD_STELLAR \
  --network testnet \
  --rpc-url "$RPC" \
  --network-passphrase "$PASS"
```

La app Next.js debe exponer `GET /api/metadata/{id}` con JSON `{ "name", "description", "image" }` y CORS (incl. `OPTIONS`); en este repo: `app/api/metadata/[id]/route.ts`.

### 5. Stellar Asset Contract (SAC) del PHASELQ clásico — “relanzar” / instalar en testnet

Para un par **code:issuer** fijo, el **Contract ID del SAC es determinista**: no cambia aunque vuelvas a ejecutar el deploy. Puedes **comprobarlo** sin firmar:

```bash
stellar contract id asset \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  --asset "PHASELQ:GD7VAD4VDVHASKZIJPRORMXLML4RSVLRANYNRCCBWLO5ACOSYQZBSUFI"
# → CCKTFAHWI3MREYMDBFF4VB5ZPIIRVZH6LYYYYW34F6NZU54N2C3MHWBZ (mismo default que `lib/phase-contract-defaults.ts`)
```

Si la CLI se queja de *passphrase missing* o *rpc-url missing*, suele ser config parcial: pasa siempre `--rpc-url` y `--network-passphrase` como arriba (o exporta `STELLAR_RPC_URL` y `STELLAR_NETWORK_PASSPHRASE`).

Si usas otro emisor, sustituye el `G…` en `--asset` (y en `.env` `NEXT_PUBLIC_CLASSIC_LIQ_ISSUER`). Si acuñaste con un **código** distinto (p. ej. `PHASERLIQ` en GAXR…), el `C…` del SAC es otro: despliega con `--asset <CODE>:<ISSUER>` y actualiza `NEXT_PUBLIC_TOKEN_CONTRACT_ID`.

Para **instanciar** el contrato builtin en la red (primera vez o si faltaba), paga fees con una cuenta testnet con XLM (cualquier `G…` con fondos; no tiene que ser el issuer):

```bash
stellar contract asset deploy \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  --asset "PHASELQ:GD7VAD4VDVHASKZIJPRORMXLML4RSVLRANYNRCCBWLO5ACOSYQZBSUFI" \
  --source-account TU_CUENTA_CON_XLM
```

Luego alinea `.env.local` con el **mismo** `C…` (o borra overrides y usa el default del repo):

- `NEXT_PUBLIC_TOKEN_CONTRACT_ID` / `NEXT_PUBLIC_PHASER_TOKEN_ID` (y equivalentes servidor sin `NEXT_PUBLIC_`).

## Comandos de Interacción

### Mock Token

```bash
# Verificar si está inicializado
stellar contract invoke \
  --id MOCK_TOKEN_ID \
  --network testnet \
  -- \
  is_initialized

# Obtener balance de tu dirección
stellar contract invoke \
  --id MOCK_TOKEN_ID \
  --network testnet \
  -- \
  balance \
  --address TU_ADDRESS_DE_FREIGHTER

# Mintear tokens (usando la función pública de test)
stellar contract invoke \
  --id MOCK_TOKEN_ID \
  --source TU_ADDRESS_DE_FREIGHTER \
  --network testnet \
  -- \
  mint_public \
  --to TU_ADDRESS_DE_FREIGHTER \
  --amount 5000000
  # 5000000 = 0.5 tokens

# Obtener total supply
stellar contract invoke \
  --id MOCK_TOKEN_ID \
  --network testnet \
  -- \
  total_supply
```

### Phase Protocol

```bash
# Verificar configuración
stellar contract invoke \
  --id PHASE_PROTOCOL_ID \
  --network testnet \
  -- \
  get_config

# Verificar si has transicionado
stellar contract invoke \
  --id PHASE_PROTOCOL_ID \
  --network testnet \
  -- \
  has_phased \
  --user TU_ADDRESS_DE_FREIGHTER

# Ver tu estado de PHASE (si has transicionado)
stellar contract invoke \
  --id PHASE_PROTOCOL_ID \
  --network testnet \
  -- \
  get_user_phase \
  --user TU_ADDRESS_DE_FREIGHTER

# INICIAR PHASE (¡La fusión!)
# Primero necesitas tener al menos 1.0 MOCK token en tu balance
# y aprobar al contrato para que pueda transferirlos

# 1. Verificar tu balance (debe ser >= 10000000)
stellar contract invoke \
  --id MOCK_TOKEN_ID \
  --network testnet \
  -- \
  balance \
  --address TU_ADDRESS_DE_FREIGHTER

# 2. Ejecutar initiate_phase
stellar contract invoke \
  --id PHASE_PROTOCOL_ID \
  --source TU_ADDRESS_DE_FREIGHTER \
  --network testnet \
  -- \
  initiate_phase \
  --user TU_ADDRESS_DE_FREIGHTER \
  --token_address MOCK_TOKEN_ID

# 3. Verificar que la transición fue exitosa
stellar contract invoke \
  --id PHASE_PROTOCOL_ID \
  --network testnet \
  -- \
  get_user_phase \
  --user TU_ADDRESS_DE_FREIGHTER
```

## Scripts Automáticos

Para facilitar el flujo de trabajo, puedes usar los scripts en `/scripts/`:

```bash
# Instalar dependencias
cd scripts/
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Ejecutar script de despliegue
npm run deploy

# Ejecutar script de interacción
npm run interact
```

## Notas Importantes

- **Testnet**: Todos los fondos son de prueba. Puedes obtener XLM de prueba en el [Friendbot](https://laboratory.stellar.org/#account-creator?network=test)
- **Lista de NFT PHASE en la app (sin indexador de terceros)**: `GET /api/wallet/phase-nfts?address=G…` recorre `total_supply` y `owner_of(1..N)` vía RPC Soroban (límite configurable con `PHASE_NFT_WALLET_SCAN_CAP`). El dashboard muestra esa “bóveda”.
- **Freighter → Collectibles (SEP-50)**: [Freighter documenta](https://docs.freighter.app/docs/whatsnew/) “Add manually” con **dirección del contrato + token id**. La extensión **no** expone `addCollectible` en `@stellar/freighter-api`; por dentro usa un backend/indexación propios, no sustituibles por la app PHASE. Lo que sí controlamos: (1) contrato alineado con el borrador [SEP-0050](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0050.md) — `name`, `symbol`, `owner_of`, `token_uri` (HTTPS → JSON `name`/`description`/`image`), eventos `mint` / `transfer` con los topics del SEP; (2) **WASM reciente**: `owner_of` y `token_uri` hacen **panic** si el id no existe (como pide el SEP), no devuelven “vacío”; (3) comprobación automática en la app: `GET /api/freighter/sep50-check?contract=C…&tokenId=N` y botón en la cámara. Tras redesplegar el WASM, actualiza `NEXT_PUBLIC_PHASE_PROTOCOL_ID`. Si “Add manually” sigue fallando, usa el ping de self-transfer en la cámara y reintenta.
- **Freighter**: Asegúrate de tener tu wallet configurada en Testnet
- **Gas Fees**: Aunque sea testnet, necesitas XLM para pagar fees. Friendbot te da 10,000 XLM gratis.
- **Contract IDs**: Guarda los contract IDs después del deploy, los necesitarás para las interacciones.

## Referencias

- [SEP-0050 (NFT Soroban, borrador)](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0050.md)
- [Soroban Documentation](https://soroban.stellar.org/)
- [Stellar CLI Reference](https://github.com/stellar/stellar-cli)
- [SEP-41 Token Interface](https://soroban.stellar.org/docs/fundamentals/built-in-contracts)
