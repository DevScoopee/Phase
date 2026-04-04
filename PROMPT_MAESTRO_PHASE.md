# 🚀 Prompt Maestro: Implementación Final de PHASE (x402)

**Versión:** 1.0  
**Fecha:** 2026-04-03  
**Target:** Cursor, Claude 3.5, GPT-4, o cualquier agente de IA

---

## 1. Contexto del Proyecto

### Descripción del Negocio
PHASE es un sistema de **Pagos Agénticos** basado en el estándar x402. Permite a los usuarios acceder a contenido protegido mediante micropagos automáticos en Soroban (Stellar).

### Contratos Desplegados

| Nombre | Contract ID | Función Principal |
|--------|-------------|-------------------|
| **PHASE_LIQ** (Token SEP-41) | `CDW3T2DXLNGMQDZLMINEF3QHXYDB3F4ZJOGQSKW6QYABA4HMUFRG7DXC` | Token de liquidez |
| **PHASE_CORE** (Protocolo) | `CA5BGDHOL7KW4VC3QO4JIVWOZRJGP53KT63INPWTPKJGWN3DLOS4PJHH` | x402 Facilitator |

### Tecnologías del Stack
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS
- **Smart Contracts:** Rust, Soroban SDK 22.0.0
- **Wallet:** Freighter (extensión Stellar)
- **Red:** Stellar Testnet

---

## 2. Requisitos Técnicos del Estándar x402

### Flujo Oficial de Stellar Agentic Payments

```
┌─────────────┐     402      ┌─────────────┐    signAuthEntry    ┌─────────────┐
│  Client     │ ───────────► │   API       │ ──────────────────► │  Freighter  │
│  (Frontend) │              │  /api/x402  │                      │   Wallet    │
└─────────────┘              └─────────────┘                      └─────────────┘
                                                                        │
                                                                        ▼
                                                                       ┌─────────────┐
                                                                       │  Soroban    │
                                                                       │  Contract   │
                                                                       │  (settle)   │
                                                                       └─────────────┘
```

### API Challenge (Endpoint x402)
El endpoint debe responder con **HTTP 402** cuando el usuario no haya completado la fase:

```typescript
// app/api/x402/route.ts
return NextResponse.json(
  { error: "Payment Required" },
  {
    status: 402,
    headers: {
      "WWW-Authenticate": `x402 token="${token}", amount="${amount}", facilitator="${facilitator}"`,
    },
  }
);
```

### Auth Entry Signing
El frontend debe usar `signAuthEntry` de Freighter para autorización delegata:
- El usuario firma un **Auth Entry** (no una transacción completa)
- El contrato usa `require_auth_for_args(...)` para validar
- El servidor puede enviar la transacción por el usuario

---

## 3. Arquitectura de Componentes

### 3.1 PhaseButton.tsx
**Ubicación:** `components/phase-button.tsx`

**Estados del UI:**
| Estado | Botón | Descripción |
|--------|-------|-------------|
| `!address` | `[ CONNECT_VESSEL ]` | Wallet no conectada |
| `address && !hasPhased` | `[ INITIATE_PHASE ]` / `[ INITIATE_PHASE_X402 ]` | Wallet conectada, sin fase |
| `hasPhased` | `[ SOLID STATE ACTIVE #ID ]` | Fase completada |
| `balance < REQUIRED` | `[ INSUFFICIENT_LIQUIDITY ]` (rojo tenue) | Sin fondos suficientes |

**Funciones requeridas:**
- `fetchWalletAddress()` → usa `getAddress()` + `isConnected()`
- `getTokenBalance(address)` → consulta balance del token LIQ
- `checkHasPhased(address)` → llama `get_user_phase` del contrato
- `buildSettleTransaction()` → construye tx para función `settle(user, token, amount, invoice)`
- `signTransaction()` → firma con Freighter
- `refreshContractData()` → refesquea datos post-transacción

**Logs de Terminal (animación):**
```
[ DETECTING LIQUIDITY... ]
[ AUTHORIZING SOROBAN TRANSACTION... ]
[ CRYSTALLIZING IDENTITY... ]
```

### 3.2 ProtectedVault.tsx
**Ubicación:** Incrustado en `PhaseButton.tsx` (o componente separado)

**Estados:**
| Estado | Visual |
|--------|--------|
| `locked` | Blur + `PROTECTED_VAULT // LOCKED` |
| `decompressing` | Logs `[ DECOMPRESSING... ]` |
| `unlocked` | Contenido visible: "Bienvenido al Nivel 01... Tu ID: #ID" |

**Animación de Descompresión:**
```
[ INITIALIZING DECOMPRESSION PROTOCOL... ]
[ EXTRACTING PHASE_DATA... ]
[ VERIFYING INTEGRITY... ]
```

### 3.3 Contrato Soroban
**Ubicación:** `contracts/phase-protocol/src/lib.rs`

**Funciones del contrato:**
```rust
// Función x402 settle con require_auth_for_args
pub fn settle(
    env: Env,
    user: Address,
    token_address: Address,
    amount: i128,
    invoice_id: u32,
) -> Result<bool, PhaseError> {
    // Validar token autorizado
    // Verificar que invoice no haya sido liquidada
    user.require_auth_for_args(&[
        token_address.to_val(),
        amount.into(),
        invoice_id.into(),
    ]);
    // Transferir tokens y registrar pago
}
```

### 3.4 API Endpoint x402
**Ubicación:** `app/api/x402/route.ts`

```typescript
// GET: Retorna 402 con WWW-Authenticate
// POST: Verifica payment_token
```

---

## 4. Constantes del Sistema

```typescript
const CONTRACT_ID = "CA5BGDHOL7KW4VC3QO4JIVWOZRJGP53KT63INPWTPKJGWN3DLOS4PJHH"
const TOKEN_ADDRESS = "CDW3T2DXLNGMQDZLMINEF3QHXYDB3F4ZJOGQSKW6QYABA4HMUFRG7DXC"
const RPC_URL = "https://soroban-testnet.stellar.org"
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
const REQUIRED_AMOUNT = "10000000" // 1.0 LIQ con 7 decimales
```

---

## 5. Reglas de Estilo (Brutalist i-Fi)

### Colores
- **Fósforo Verde:** `#00ff00` (principal)
- **Cyan:** `#00ffff` (x402)
- **Rojo tenue:** `#991b1b` (errores, insufficient liquidity)
- **Verde neón:** `text-green-400`, `shadow-[0_0_20px_rgba(34,197,94,0.5)]`

### Efectos
- **Glow:** `shadow-[0_0_20px_rgba(34,197,94,0.5)]`
- **Blur:** `backdrop-blur-md`
- **Terminal:** `font-mono text-[10px]`

### Bordes ASCII
```
┌─────────────────────────┐
│  PROTECTED_VAULT        │
│  // LOCKED              │
└─────────────────────────┘
```

---

## 6. Seguridad

### ⚠️ Reglas Críticas
1. **Nunca hardcodear claves privadas** - Usar Freighter para todo
2. **userAddress viene de la wallet** - No de variables de entorno
3. **Firma siempre del lado del cliente** - Nunca enviar secret key
4. **Validar balance antes de tx** - Evitar transacciones fallidas

---

## 7. Verificación de Implementación

### Checklist de Pruebas
- [ ] PhaseButton muestra `CONNECT_VESSEL` sin wallet
- [ ] PhaseButton muestra `INITIATE_PHASE` con wallet conectada
- [ ] Balance check muestra `INSUFFICIENT_LIQUIDITY` si < 10M
- [ ] Logs de terminal aparecen secuencialmente
- [ ] Después de tx exitosa, `hasPhased` se actualiza automáticamente
- [ ] ProtectedVault muestra blur cuando `hasPhased: false`
- [ ] ProtectedVault revela contenido cuando `hasPhased: true`
- [ ] API `/api/x402` retorna 402 con headers correctos

### Build
```bash
npm run build  # Debe compilar sin errores
```

---

## 8. Comandos de Desarrollo

```bash
# Desarrollo
npm run dev

# Compilar contratos
cd contracts/phase-protocol
cargo build --target wasm32-unknown-unknown --release

# Desplegar (testnet)
stellar contract deploy --wasm target/... --network testnet

# Interactuar con contrato
stellar contract invoke --id CCHK... --network testnet -- initialize ...
```

---

## 9. Archivos Clave

| Archivo | Descripción |
|---------|-------------|
| `components/phase-button.tsx` | Componente principal con toda la lógica |
| `contracts/phase-protocol/src/lib.rs` | Contrato Rust con funciones x402 |
| `app/api/x402/route.ts` | Endpoint API con challenge 402 |
| `scripts/.env` | Configuración de red y contratos |

---

**Prompt generado por:** PHASE Protocol Engineering Team  
**Para uso en:** Agentes de IA (Cursor, Claude, GPT-4)