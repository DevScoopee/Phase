# Configuración de Entorno PHASE

Esta guía te ayuda a configurar correctamente las variables de entorno para evitar errores comunes.

## ⚠️ Errores Comunes y Soluciones

### Error 1: "TOKEN_ADDRESS es una cuenta G... pero debe ser un Contract C..."

**Causa**: Has configurado tu dirección de wallet Freighter (G...) en lugar del Contract ID del token (C...).

**Solución**:
1. El token PHASELQ debe estar desplegado como Stellar Asset Contract (SAC)
2. Obtén el Contract ID correcto:
   ```bash
   stellar contract asset deploy --asset PHASELQ:GISSUER --network testnet
   ```
3. El comando devolverá un Contract ID que comienza con "C" (56 caracteres)
4. Configura ese valor en `NEXT_PUBLIC_PHASER_TOKEN_ID`

### Error 2: "ADMIN_SECRET_KEY no coincide con el issuer"

**Causa**: El faucet está configurado en modo mint, pero la cuenta firmante no es el issuer del asset.

**Solución - Opción A (modo mint)**:
- `ADMIN_SECRET_KEY` debe ser el secret key de la cuenta que emitió el asset PHASELQ
- Esta cuenta debe tener fondos de XLM para pagar fees de Soroban

**Solución - Opción B (modo transfer - recomendado)**:
- Configura `FAUCET_DISTRIBUTOR_SECRET_KEY` en lugar de `ADMIN_SECRET_KEY`
- Esta cuenta debe tener saldo de PHASELQ (previamente acuñado)
- Esta cuenta debe tener XLM para fees de red

### Error 3: "Falta la trustline PHASELQ"

**Causa**: El usuario intenta recibir PHASELQ pero no ha establecido la trustline en su wallet.

**Solución para usuarios**:
1. Conectar wallet en la página /forge
2. Hacer clic en "INITIALIZE PHASER PROTOCOL"
3. Firmar la transacción changeTrust en Freighter
4. Volver a intentar reclamar del faucet

### Error 4: "FAUCET_SIGNER_LOW_XLM"

**Causa**: La cuenta que firma las transacciones del faucet no tiene suficiente XLM.

**Solución**:
```bash
# Fondea la cuenta del faucet (la de ADMIN_SECRET_KEY o FAUCET_DISTRIBUTOR_SECRET_KEY)
curl "https://friendbot.stellar.org/?addr=G...SIGNER_ADDRESS"
```

## 🔧 Pasos de Configuración

### 1. Crear archivo .env.local

```bash
cp .env.local.example .env.local
```

### 2. Configurar Contratos Soroban

```bash
# Desplegar el contrato PHASE (NFT)
stellar contract deploy --wasm phase_protocol.wasm --network testnet
# → Guarda el Contract ID (C...) como NEXT_PUBLIC_PHASE_PROTOCOL_ID

# Desplegar el SAC para PHASELQ (si no existe)
stellar contract asset deploy --asset PHASELQ:GISSUER --network testnet
# → Guarda el Contract ID como NEXT_PUBLIC_PHASER_TOKEN_ID
```

### 3. Configurar Asset Clásico

```bash
# En scripts/
CLASSIC_LIQ_ISSUER_SECRET=S... npm run set:issuer-home-domain
```

### 4. Verificar Configuración

```bash
npm run diagnose
```

Este comando verifica:
- ✅ Formato correcto de Contract IDs (C..., no G...)
- ✅ Coincidencia entre TOKEN_ADDRESS y SAC del asset clásico
- ✅ Configuración correcta del faucet
- ✅ Balance XLM suficiente

## 📋 Variables de Entorno Requeridas

### Para el protocolo (obligatorio)

```bash
# Contract ID del token PHASELQ (Soroban)
NEXT_PUBLIC_PHASER_TOKEN_ID=C...

# Contract ID del protocolo PHASE (Soroban)
NEXT_PUBLIC_PHASE_PROTOCOL_ID=C...
```

### Para el faucet (uno de los dos)

```bash
# Opción A: Modo mint - ADMIN debe ser el issuer del asset
ADMIN_SECRET_KEY=S...

# Opción B: Modo transfer - Distribuidor con saldo
FAUCET_DISTRIBUTOR_SECRET_KEY=S...
```

### Para el asset clásico (recomendado)

```bash
# Código del asset
NEXT_PUBLIC_CLASSIC_LIQ_ASSET_CODE=PHASELQ

# Issuer del asset (dirección G...)
NEXT_PUBLIC_CLASSIC_LIQ_ISSUER=G...

# Secret del issuer (solo servidor)
CLASSIC_LIQ_ISSUER_SECRET=S...
```

## 🧪 Comandos Útiles

```bash
# Diagnóstico de configuración
npm run diagnose

# Pagar desde issuer a distribuidor
npm run classic:issuer-to-distributor

# Configurar home_domain del issuer
npm run set:issuer-home-domain

# Setup completo de PHASE v2
npm run setup:phase-v2
```

## 🔍 Verificación en Stellar Expert

1. Busca el issuer del asset: https://stellar.expert/explorer/testnet/account/GISSUER
2. Ve a la sección "Assets"
3. Haz clic en "Contract ID" del PHASELQ
4. Verifica que coincida con tu `NEXT_PUBLIC_PHASER_TOKEN_ID`

## 🚨 Checklist Pre-Deploy

- [ ] `npm run diagnose` pasa sin errores
- [ ] La cuenta del faucet tiene >5 XLM
- [ ] El modo mint: ADMIN_SECRET_KEY es el issuer
- [ ] El modo transfer: distribuidor tiene saldo PHASELQ
- [ ] Trustline del asset clásico configurada correctamente
- [ ] `NEXT_PUBLIC_CLASSIC_LIQ_ISSUER` coincide con el issuer real
- [ ] steller.toml está accesible en `/.well-known/stellar.toml`
