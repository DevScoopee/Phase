# 🚀 Prompt Maestro: Final Implementation of PHASE (x402)

**Version:** 1.0  
**Date:** 2026-04-03  
**Target:** Cursor, Claude 3.5, GPT-4, or any AI agent

---

## 1. Project Context

### Business Description

PHASE is an **Agentic Payments** system based on the x402 standard. It allows users to access protected content through automatic micropayments on Soroban (Stellar).

### Deployed Contracts

| Name                         | Contract ID                                                | Main Function    |
| ---------------------------- | ---------------------------------------------------------- | ---------------- |
| **PHASE_LIQ** (SEP-41 Token) | `CDW3T2DXLNGMQDZLMINEF3QHXYDB3F4ZJOGQSKW6QYABA4HMUFRG7DXC` | Liquidity token  |
| **PHASE_CORE** (Protocol)    | `CDXZ2HWPSAU3DKACNGTTY3WM6FKN5LPNGMAYFW4KBF74P42RK6SFDRGP` | x402 Facilitator |

**Stellar Expert (testnet):** [PHASE_CORE](https://stellar.expert/explorer/testnet/contract/CDXZ2HWPSAU3DKACNGTTY3WM6FKN5LPNGMAYFW4KBF74P42RK6SFDRGP) · [PHASERLIQ](https://stellar.expert/explorer/testnet/asset/PHASERLIQ-GAXRPE5JXPY7RJONMCEWFXELVWDW3CSA7H6LAGYKTOYLFQQDJ5DT4GNS)

### Brand Assets (repo)

| File                              | Usage                         |
| --------------------------------- | ----------------------------- |
| `public/og-phase.png`             | Open Graph / Twitter Card     |
| `public/icon-sphere.png`          | Favicon / Apple icon          |
| `public/phaser-liq-token.png`     | PHASELQ Icon + `stellar.toml` |
| `public/.well-known/stellar.toml` | SEP-0001                      |

Metadata in `app/layout.tsx`. Detailed documentation: **README.md** and **`/docs`** in the app.

### Technology Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS
- **Smart Contracts:** Rust, Soroban SDK 22.0.0
- **Wallet:** Freighter (Stellar extension)
- **Network:** Stellar Testnet

---

## 2. Technical Requirements of the x402 Standard

### Official Stellar Agentic Payments Flow

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

### API Challenge (x402 Endpoint)

The endpoint must respond with **HTTP 402** when the user has not completed the phase:

```typescript
// app/api/x402/route.ts
return NextResponse.json(
  { error: "Payment Required" },
  {
    status: 402,
    headers: {
      "WWW-Authenticate": `x402 token="${token}", amount="${amount}", facilitator="${facilitator}"`,
    },
  },
);
```

### Auth Entry Signing

The frontend must use Freighter's `signAuthEntry` for delegated authorization:

- The user signs an **Auth Entry** (not a full transaction)
- The contract uses `require_auth_for_args(...)` to validate
- The server can submit the transaction on behalf of the user

---

## 3. Component Architecture

### 3.1 PhaseButton.tsx

**Location:** `components/phase-button.tsx`

**UI States:**
| State | Button | Description |
|-------|--------|-------------|
| `!address` | `[ CONNECT_VESSEL ]` | Wallet not connected |
| `address && !hasPhased` | `[ INITIATE_PHASE ]` / `[ INITIATE_PHASE_X402 ]` | Wallet connected, no phase |
| `hasPhased` | `[ SOLID STATE ACTIVE #ID ]` | Phase completed |
| `balance < REQUIRED` | `[ INSUFFICIENT_LIQUIDITY ]` (dim red) | Insufficient funds |

**Required Functions:**

- `fetchWalletAddress()` → uses `getAddress()` + `isConnected()`
- `getTokenBalance(address)` → queries LIQ token balance
- `checkHasPhased(address)` → calls `get_user_phase` from the contract
- `buildSettleTransaction()` → builds tx for `settle(user, token, amount, invoice)` function
- `signTransaction()` → signs with Freighter
- `refreshContractData()` → refreshes data post-transaction

**Terminal Logs (animation):**

```
[ DETECTING LIQUIDITY... ]
[ AUTHORIZING SOROBAN TRANSACTION... ]
[ CRYSTALLIZING IDENTITY... ]
```

### 3.2 ProtectedVault.tsx

**Location:** Embedded within `PhaseButton.tsx` (or as a separate component)

**States:**
| State | Visual |
|-------|--------|
| `locked` | Blur + `PROTECTED_VAULT // LOCKED` |
| `decompressing` | Logs `[ DECOMPRESSING... ]` |
| `unlocked` | Content visible: "Welcome to Level 01... Your ID: #ID" |

**Decompression Animation:**

```
[ INITIALIZING DECOMPRESSION PROTOCOL... ]
[ EXTRACTING PHASE_DATA... ]
[ VERIFYING INTEGRITY... ]
```

### 3.3 Soroban Contract

**Location:** `contracts/phase-protocol/src/lib.rs`

**Contract Functions:**

```rust
// x402 settle function with require_auth_for_args
pub fn settle(
    env: Env,
    user: Address,
    token_address: Address,
    amount: i128,
    invoice_id: u32,
) -> Result<bool, PhaseError> {
    // Validate authorized token
    // Verify invoice hasn't been settled
    user.require_auth_for_args(&[
        token_address.to_val(),
        amount.into(),
        invoice_id.into(),
    ]);
    // Transfer tokens and record payment
}
```

### 3.4 x402 API Endpoint

**Location:** `app/api/x402/route.ts`

```typescript
// GET: Returns 402 with WWW-Authenticate
// POST: Verifies payment_token
```

---

## 4. System Constants

```typescript
const CONTRACT_ID = "CDXZ2HWPSAU3DKACNGTTY3WM6FKN5LPNGMAYFW4KBF74P42RK6SFDRGP";
const TOKEN_ADDRESS =
  "CDW3T2DXLNGMQDZLMINEF3QHXYDB3F4ZJOGQSKW6QYABA4HMUFRG7DXC";
const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const REQUIRED_AMOUNT = "10000000"; // 1.0 LIQ with 7 decimals
```

---

## 5. Style Rules (Brutalist i-Fi)

### Colors

- **Phosphorus Green:** `#00ff00` (primary)
- **Cyan:** `#00ffff` (x402)
- **Dull Red:** `#991b1b` (errors, insufficient liquidity)
- **Neon Green:** `text-green-400`, `shadow-[0_0_20px_rgba(34,197,94,0.5)]`

### Effects

- **Glow:** `shadow-[0_0_20px_rgba(34,197,94,0.5)]`
- **Blur:** `backdrop-blur-md`
- **Terminal:** `font-mono text-[10px]`

### ASCII Borders

```
┌─────────────────────────┐
│  PROTECTED_VAULT        │
│  // LOCKED              │
└─────────────────────────┘
```

---

## 6. Security

### ⚠️ Critical Rules

1. **Never hardcode private keys** - Use Freighter for everything
2. **userAddress comes from the wallet** - Not from environment variables
3. **Always sign on the client side** - Never send secret key
4. **Validate balance before tx** - Avoid failed transactions

---

## 7. Implementation Verification

### Testing Checklist

- [ ] PhaseButton shows `CONNECT_VESSEL` without wallet
- [ ] PhaseButton shows `INITIATE_PHASE` with wallet connected
- [ ] Balance check shows `INSUFFICIENT_LIQUIDITY` if < 10M
- [ ] Terminal logs appear sequentially
- [ ] After successful tx, `hasPhased` updates automatically
- [ ] ProtectedVault shows blur when `hasPhased: false`
- [ ] ProtectedVault reveals content when `hasPhased: true`
- [ ] API `/api/x402` returns 402 with correct headers

### Build

```bash
npm run build  # Must compile without errors
```

---

## 8. Development Commands

```bash
# Development
npm run dev

# Compile contracts
cd contracts/phase-protocol
cargo build --target wasm32-unknown-unknown --release

# Deploy (testnet)
stellar contract deploy --wasm target/... --network testnet

# Interact with contract
stellar contract invoke --id CCHK... --network testnet -- initialize ...
```

---

## 9. Key Files

| File                                  | Description                        |
| ------------------------------------- | ---------------------------------- |
| `components/phase-button.tsx`         | Main component with all the logic  |
| `contracts/phase-protocol/src/lib.rs` | Rust contract with x402 functions  |
| `app/api/x402/route.ts`               | API endpoint with 402 challenge    |
| `scripts/.env`                        | Network and contract configuration |

---

**Prompt generated by:** PHASE Protocol Engineering Team  
**For use with:** AI Agents (Cursor, Claude, GPT-4)
