# Freighter Collector Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PHASE NFTs appear correctly in Freighter's Collectibles tab by fixing the `u32`/`u64` type mismatch in `owner_of`, `token_uri`, and `token_metadata`, and resolving the image mismatch in `token_metadata`.

**Architecture:** Change the three public SEP-50 functions to accept `u32` (what Freighter sends), keep `_u64` aliases for backwards compat, fix image resolution in `token_metadata`, redeploy contract, update TypeScript callers to use `u32`.

**Tech Stack:** Rust/Soroban SDK 22, `stellar` CLI, TypeScript, Next.js

---

## Files

| File | Change |
|---|---|
| `contracts/phase-protocol/src/lib.rs` | Swap `owner_of`/`token_uri`/`token_metadata` to `u32`, add `_u64` aliases, fix image in `token_metadata` |
| `lib/phase-protocol.ts` | Update callers of `owner_of`, `token_uri`, `token_metadata` to use `u32` |
| `lib/phase-contract-defaults.ts` | Auto-updated by deploy script with new contract ID |
| `.env.local` | Auto-updated by deploy script with new contract ID |

---

## Task 1: Fix Rust contract — `owner_of`, `token_uri`, `token_metadata` signatures

**File:** `contracts/phase-protocol/src/lib.rs`

- [ ] **Step 1: Replace `owner_of` + `owner_of_u32` with `owner_of(u32)` + `owner_of_u64(u64)`**

Find and replace the two existing functions (around line 899–914):

```rust
    /// SEP-0050 / Freighter: `token_id` como `u32` (tipo estándar que usan los clientes).
    pub fn owner_of(env: Env, token_id: u32) -> Address {
        match env
            .storage()
            .persistent()
            .get::<DataKey, Address>(&DataKey::TokenOwner(token_id as u64))
        {
            Some(a) => a,
            None => panic!("Phase NFT: invalid token id"),
        }
    }

    /// Alias `u64` para clientes que invocan con entero de 64 bits (backwards compat).
    pub fn owner_of_u64(env: Env, token_id: u64) -> Address {
        Self::owner_of(env, token_id as u32)
    }
```

- [ ] **Step 2: Replace `token_uri` + `token_uri_u32` with `token_uri(u32)` + `token_uri_u64(u64)`**

Find and replace (around line 1121–1137):

```rust
    /// SEP-0050: URI HTTPS del JSON de metadata. `token_id` como `u32` (estándar Freighter).
    pub fn token_uri(env: Env, token_id: u32) -> String {
        if env
            .storage()
            .persistent()
            .get::<DataKey, Address>(&DataKey::TokenOwner(token_id as u64))
            .is_none()
        {
            panic!("Phase NFT: invalid token id");
        }
        build_metadata_token_uri(&env, token_id as u64)
    }

    /// Alias `u64` para backwards compat.
    pub fn token_uri_u64(env: Env, token_id: u64) -> String {
        Self::token_uri(env, token_id as u32)
    }
```

- [ ] **Step 3: Replace `token_metadata` + `token_metadata_u32` with `token_metadata(u32)` + `token_metadata_u64`, and fix image to resolve ipfs:// URIs**

Find and replace (around line 1140–1165):

```rust
    /// SEP-0050: metadatos como `Map<Symbol, String>`. `image` resuelto a HTTPS (ipfs:// → gateway).
    pub fn token_metadata(env: Env, token_id: u32) -> Map<Symbol, String> {
        if env
            .storage()
            .persistent()
            .get::<DataKey, Address>(&DataKey::TokenOwner(token_id as u64))
            .is_none()
        {
            panic!("Phase NFT: invalid token id");
        }
        let name = build_token_display_name(&env, token_id as u64);
        let phase_level = Self::get_phase_level(env.clone(), token_id as u64);
        let description = build_metadata_description_string(&env, phase_level);
        let raw_image = build_token_image_raw_string(&env, token_id as u64);
        let image = resolve_image_to_https(&env, &raw_image);
        let mut m = Map::new(&env);
        m.set(Symbol::new(&env, "name"), name);
        m.set(Symbol::new(&env, "description"), description);
        m.set(Symbol::new(&env, "image"), image);
        m
    }

    /// Alias `u64` para backwards compat.
    pub fn token_metadata_u64(env: Env, token_id: u64) -> Map<Symbol, String> {
        Self::token_metadata(env, token_id as u32)
    }
```

- [ ] **Step 4: Add `resolve_image_to_https` helper before the `#[contract]` block**

Add this free function near the other helpers (e.g., after `build_token_image_raw_string`). Uses `copy_into_slice` — the same pattern as `build_metadata_token_uri` and `append_soroban_str_to_bytes` in the file:

```rust
/// Convierte `ipfs://<cid>` → `https://ipfs.io/ipfs/<cid>`.
/// Deja URLs HTTPS y strings vacíos sin cambios.
fn resolve_image_to_https(env: &Env, raw: &String) -> String {
    const IPFS_PREFIX: &[u8] = b"ipfs://";
    const HTTPS_GATEWAY: &[u8] = b"https://ipfs.io/ipfs/";

    let n = raw.len() as usize;
    if n == 0 {
        return raw.clone();
    }
    let mut buf = [0u8; 512];
    if n > buf.len() {
        return raw.clone();
    }
    raw.copy_into_slice(&mut buf[..n]);

    if n > IPFS_PREFIX.len() && &buf[..IPFS_PREFIX.len()] == IPFS_PREFIX {
        let cid_bytes = &buf[IPFS_PREFIX.len()..n];
        let mut out = Bytes::from_slice(env, HTTPS_GATEWAY);
        out.extend_from_slice(cid_bytes);
        let out_len = out.len() as usize;
        let mut out_buf = [0u8; 512];
        if out_len > out_buf.len() {
            return raw.clone();
        }
        out.copy_into_slice(&mut out_buf[..out_len]);
        String::from_bytes(env, &out_buf[..out_len])
    } else {
        raw.clone()
    }
}

- [ ] **Step 5: Verify the contract compiles**

```bash
cd contracts/phase-protocol
cargo build --target wasm32-unknown-unknown --release 2>&1 | tail -20
```

Expected: `Compiling phase-protocol ... Finished release` with no errors.

If there are errors about `String::to_string()` or `alloc`, adjust `resolve_image_to_https` to use the same string-building pattern as `build_metadata_token_uri` (which uses `String::from_str(env, &format!(...))`).

- [ ] **Step 6: Commit**

```bash
git add contracts/phase-protocol/src/lib.rs
git commit -m "fix(contract): owner_of/token_uri/token_metadata accept u32 for Freighter SEP-50 compat"
```

---

## Task 2: Optimize and deploy contract to testnet

**Files:** `contracts/phase-protocol/target/...`, `lib/phase-contract-defaults.ts`, `.env.local`

- [ ] **Step 1: Optimize the WASM**

```bash
stellar contract optimize \
  --wasm contracts/phase-protocol/target/wasm32-unknown-unknown/release/phase_protocol.wasm \
  --wasm-out contracts/phase-protocol/target/wasm32-unknown-unknown/release/phase_protocol.optimized.wasm
```

Expected: `Optimized bytes saved to .../phase_protocol.optimized.wasm`

- [ ] **Step 2: Run the deploy script**

```bash
cd scripts && npx tsx deploy-phase-sep50.ts
```

Expected output ends with something like:
```
Contract ID: CNEW...
Updated lib/phase-contract-defaults.ts
Updated .env.local
```

- [ ] **Step 3: Verify new contract ID is in `.env.local`**

```bash
grep PHASE_PROTOCOL_ID .env.local
```

Expected: two lines with a new `C...` contract ID (different from `CDRTV2...` or `CDBYNK...`).

- [ ] **Step 4: Commit**

```bash
git add lib/phase-contract-defaults.ts
git commit -m "chore(deploy): redeploy phase-protocol with u32 SEP-50 interface"
```

---

## Task 3: Update TypeScript callers to use `u32`

**File:** `lib/phase-protocol.ts`

- [ ] **Step 1: Update `fetchTokenUriString` to call `token_uri` with `u32`**

Find (around line 1607):
```typescript
      "token_uri",
      [nativeToScVal(tokenId, { type: "u64" })],
```

Replace with:
```typescript
      "token_uri",
      [nativeToScVal(tokenId, { type: "u32" })],
```

- [ ] **Step 2: Update `fetchTokenMetadataMap` to call `token_metadata` with `u32`**

Find (around line 1639):
```typescript
      "token_metadata",
      [nativeToScVal(tokenId, { type: "u64" })],
```

Replace with:
```typescript
      "token_metadata",
      [nativeToScVal(tokenId, { type: "u32" })],
```

- [ ] **Step 3: Update `fetchTokenOwnerAddress` — primary `u32`, fallback `owner_of_u64` with `u64`**

Find (around line 2018–2035):
```typescript
  const tryOwner = async (method: "owner_of" | "owner_of_u32", type: "u64" | "u32") => {
    const native = await simulateContractCall(
      contractId,
      method,
      [nativeToScVal(tokenId, { type })],
      READONLY_SIM_SOURCE_G,
    )
    return parseOwnerOfReturn(native)
  }
  try {
    return await tryOwner("owner_of", "u64")
  } catch {
    /* Freighter / tooling a veces compilan la llamada con u32 */
  }
  try {
    return await tryOwner("owner_of_u32", "u32")
  } catch {
    return null
  }
```

Replace with:
```typescript
  const tryOwner = async (method: "owner_of" | "owner_of_u64", type: "u32" | "u64") => {
    const native = await simulateContractCall(
      contractId,
      method,
      [nativeToScVal(tokenId, { type })],
      READONLY_SIM_SOURCE_G,
    )
    return parseOwnerOfReturn(native)
  }
  try {
    return await tryOwner("owner_of", "u32")
  } catch {
    /* fallback para contratos legacy que exponen owner_of(u64) */
  }
  try {
    return await tryOwner("owner_of_u64", "u64")
  } catch {
    return null
  }
```

- [ ] **Step 4: TypeScript compile check**

```bash
npx tsc --noEmit 2>&1 | grep -v ".next/" | grep -v "^$"
```

Expected: no output (no errors).

- [ ] **Step 5: Commit**

```bash
git add lib/phase-protocol.ts
git commit -m "fix(ts): update owner_of/token_uri/token_metadata callers to use u32"
```

---

## Task 4: Verify with sep50-check

- [ ] **Step 1: Get the new contract ID**

```bash
grep NEXT_PUBLIC_PHASE_PROTOCOL_ID .env.local
```

- [ ] **Step 2: Run sep50-check against the new contract + token_id=1**

Replace `CNEW_CONTRACT_ID` with the actual ID from Step 1:

```bash
curl -s "http://localhost:3000/api/freighter/sep50-check?contract=CNEW_CONTRACT_ID&tokenId=1" \
  | python3 -m json.tool
```

Expected result:
```json
{
  "ok": true,
  "sep50Ready": true,
  "checks": {
    "name": { "ok": true },
    "symbol": { "ok": true },
    "owner_of": { "ok": true },
    "token_uri_https": { "ok": true },
    "metadata_json": { "ok": true },
    "token_metadata": { "ok": true },
    "token_metadata_json_align": { "ok": true, "detail": "ok" }
  }
}
```

If `token_metadata_json_align` is still failing, verify that `resolve_image_to_https` is being called and the IPFS URI is getting converted correctly.

- [ ] **Step 3: Test in Freighter**

1. Open Freighter extension
2. Go to Account → Collectibles tab
3. Click the options icon → "Add manually"
4. Enter:
   - Contract ID: `CNEW_CONTRACT_ID` (from .env.local)
   - Token ID: `1`
5. Expected: NFT appears with name "Phase Artifact #1" and the collection image

- [ ] **Step 4: Commit final state**

```bash
git add .
git commit -m "feat(freighter): PHASE NFTs visible in Freighter collector — SEP-50 u32 fix complete"
```

---

## Notes

- The `_u64` alias functions (`owner_of_u64`, `token_uri_u64`, `token_metadata_u64`) are kept in the contract so any external tooling using the old names doesn't break immediately.
- After verifying in Freighter testnet, update Vercel env vars (`NEXT_PUBLIC_PHASE_PROTOCOL_ID`, `PHASE_PROTOCOL_ID`) with the new contract ID so production (`phasee.xyz`) also works.
- Mercury events already captured for the old contract won't transfer — the new contract starts fresh. Any new mints on the new contract will be indexed by Mercury automatically (since Federico's JWT indexes by contract ID and the new ID is in the JWT scope).
