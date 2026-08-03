# Freighter Collector Fix — Design Spec

**Date**: 2026-04-10  
**Status**: ✅ Approved by user

## Problem

PHASE NFTs are invisible in Freighter's Collectibles tab. Two root causes:

1. **"Collectible not found"** — Freighter calls `owner_of(token_id)` encoding `token_id` as `u32`. Our contract's `owner_of` takes `u64` → XDR type mismatch → simulation panics → Freighter shows "Collectible not found". Same issue with `token_uri`.

2. **`image_mismatch`** — `token_metadata()` on-chain returns `image: ""` (empty by design). Freighter reads the on-chain map directly and shows a broken/empty image even though `/api/metadata/{id}` has the correct IPFS URL.

## Solution

### 1. Rust contract changes (`contracts/phase-protocol/src/lib.rs`)

**`owner_of`**: Change primary signature to `u32`, keep `u64` as `owner_of_u64`:
```rust
pub fn owner_of(env: Env, token_id: u32) -> Address { ... }      // SEP-50 standard
pub fn owner_of_u64(env: Env, token_id: u64) -> Address { ... }  // backwards compat
// Remove: owner_of_u32 (merged into owner_of)
```

**`token_uri`**: Same swap:
```rust
pub fn token_uri(env: Env, token_id: u32) -> String { ... }      // SEP-50 standard
pub fn token_uri_u64(env: Env, token_id: u64) -> String { ... }  // backwards compat
// Remove: token_uri_u32 (merged into token_uri)
```

**`token_metadata`**: Resolve image from collection storage instead of returning empty:
```rust
pub fn token_metadata(env: Env, token_id: u32) -> Map<Symbol, String> {
    // resolve name, description, AND image from CollectionSettings.image_uri
}
```

**`get_token_collection_id`, `get_collection`, other u64 methods**: keep u64 — only `owner_of`, `token_uri`, `token_metadata` need the swap since those are the ones Freighter calls.

### 2. Contract redeploy

Build WASM, deploy to testnet, update `.env.local` and Vercel env vars with new contract ID.

### 3. TypeScript client updates (`lib/phase-protocol.ts`)

- `fetchTokenOwnerAddress`: primary call uses `owner_of` with `u32`, fallback `owner_of_u64` with `u64`
- `fetchTokenUriString`: primary call uses `token_uri` with `u32`
- `fetchTokenMetadataMap`: update to call `token_metadata` with `u32`
- All other callers of `owner_of` / `token_uri`: update to use `u32`

### 4. sep50-check update (`app/api/freighter/sep50-check/route.ts`)

Remove the dual-try fallback logic — call `owner_of(u32)` directly.

## Success Criteria

- Freighter "Add manually" with contract ID + token ID shows the NFT ✅
- Collectible shows real image from collection ✅  
- `sep50Ready: true` with no `image_mismatch` ✅
- Existing functionality (dashboard, chamber, RPC scan) unaffected ✅

## Risks

- Renaming functions is a breaking change for any external caller using `owner_of_u64`-named method — mitigated by keeping the old name as an alias
- After redeploy, old contract ID is abandoned — need to update all env vars atomically
