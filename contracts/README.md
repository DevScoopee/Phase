# PHASE Protocol - Contratos Soroban

Este directorio contiene los contratos inteligentes del protocolo PHASE para Stellar/Soroban.

## Referencia desplegada (testnet, valores por defecto del repo)

Estos IDs coinciden con `lib/phase-protocol.ts` en la app Next.js. Si redespliegas, actualiza `.env.local` y la documentación.

| Contrato | Contract ID | Stellar Expert |
|----------|-------------|----------------|
| **phase-protocol** (núcleo) | `CDZKNN7Z756OWAU3GY5WAOJ5BOMUBSZDVDCGLESG734LNEHIUDL3EQL6` | [Ver ↗](https://stellar.expert/explorer/testnet/contract/CDZKNN7Z756OWAU3GY5WAOJ5BOMUBSZDVDCGLESG734LNEHIUDL3EQL6) |
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

```bash
# Desplegar Mock Token
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/mock_token.optimized.wasm \
  --source TU_ADDRESS_DE_FREIGHTER \
  --network testnet

# Guarda el contract ID que te devuelve (ej: CABC...1234)
# Este es tu MOCK_TOKEN_ID

# Desplegar Phase Protocol
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/phase_protocol.optimized.wasm \
  --source TU_ADDRESS_DE_FREIGHTER \
  --network testnet

# Guarda el contract ID (ej: CDEF...5678)
# Este es tu PHASE_PROTOCOL_ID
```

### 4. Inicializar Contratos

```bash
# Inicializar Mock Token
stellar contract invoke \
  --id MOCK_TOKEN_ID \
  --source TU_ADDRESS_DE_FREIGHTER \
  --network testnet \
  -- \
  initialize \
  --admin TU_ADDRESS_DE_FREIGHTER \
  --decimals 7 \
  --name "Mock Test Token" \
  --symbol "MOCK"

# Inicializar Phase Protocol
stellar contract invoke \
  --id PHASE_PROTOCOL_ID \
  --source TU_ADDRESS_DE_FREIGHTER \
  --network testnet \
  -- \
  initialize \
  --admin TU_ADDRESS_DE_FREIGHTER \
  --token_address MOCK_TOKEN_ID \
  --required_amount 10000000
  # 10000000 = 1.0 token con 7 decimales
```

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
- **Freighter**: Asegúrate de tener tu wallet configurada en Testnet
- **Gas Fees**: Aunque sea testnet, necesitas XLM para pagar fees. Friendbot te da 10,000 XLM gratis.
- **Contract IDs**: Guarda los contract IDs después del deploy, los necesitarás para las interacciones.

## Referencias

- [Soroban Documentation](https://soroban.stellar.org/)
- [Stellar CLI Reference](https://github.com/stellar/stellar-cli)
- [SEP-41 Token Interface](https://soroban.stellar.org/docs/fundamentals/built-in-contracts)
