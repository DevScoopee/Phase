#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Bytes,
    BytesN, Env, Map, String, Symbol, Vec,
};

/// Errores del protocolo PHASE
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum PhaseError {
    AlreadyPhased = 1,
    InsufficientBalance = 2,
    TransferFailed = 3,
    UnauthorizedToken = 4,
    SettlementFailed = 5,
    InvalidInvoice = 6,
    InvalidCollection = 7,
    CreatorAlreadyHasCollection = 8,
    AmountBelowCollectionPrice = 9,
    InvalidCollectionMetadata = 10,
    NftNotFound = 11,
    NotNftOwner = 12,
    SelfTransfer = 13,
    /// SEP-50: `approve` / `transfer_from` sin permiso de operador o allowance.
    UnauthorizedApprover = 14,
    NotApproved = 15,
    InvalidApproval = 16,
    /// Lista enumerable del dueño desincronizada (solo debería ocurrir con WASM antiguo sin `OwnerTokenList`).
    InvalidOwnerTokenList = 17,
}

/// Configuración de una colección creada por un usuario (factory).
#[contracttype]
pub struct CollectionSettings {
    pub collection_id: u64,
    pub creator: Address,
    pub name: String,
    /// Precio en unidades mínimas del token LIQ (x402)
    pub price: i128,
    /// URL de arte (IPFS/https) expuesta vía `/api/metadata/[id]` y wallets; sin `"` ni `\` (ASCII imprimible ≥32).
    pub image_uri: String,
}

/// Estado PHASE — NFT por (usuario, colección).
#[contracttype]
pub struct PhaseState {
    pub token_id: u64,
    pub collection_id: u64,
    pub timestamp: u64,
    pub amount_locked: i128,
    pub token_address: Address,
    pub energy_level_bp: u32,
    pub phase_level: String,
}

#[contracttype]
pub struct PaymentRecord {
    pub invoice_id: u32,
    pub amount: i128,
    pub token: Address,
    pub payer: Address,
    pub settled: bool,
    pub timestamp: u64,
}

/// 95% creador, 5% tesorería protocolo (basis points implícitos 9500/500).
const FEE_CREATOR_BP: i128 = 95;
const FEE_DENOM: i128 = 100;

#[contracttype]
pub enum DataKey {
    PhaseCounter,
    /// Fase por usuario y colección (`0` = legado / pool global del protocolo).
    UserPhase(Address, u64),
    TokenOwner(u64),
    /// token_id → collection_id (para metadatos / consultas)
    TokenCollection(u64),
    AuthorizedToken,
    RequiredAmount,
    X402Payment(u32),
    X402InvoiceCounter,
    DelegatedAuth(Address, u64),
    CollectionCounter,
    Collection(u64),
    CreatorToCollection(Address),
    /// Lista ordenada de todos los collection_id creados por esta dirección (multi-colección).
    CreatorCollectionList(Address),
    ProtocolTreasury,
    /// Recuento de NFTs de utilidad por titular (SEP-41 / Freighter); mantenido en mint y transfer.
    Balance(Address),
    /// SEP-50 `approve`: un solo `approved` por `token_id` (revocado al transferir).
    NftApproval(u64),
    /// SEP-50 `approve_for_all`: `operator` puede actuar hasta ledger (0 = revocado).
    OperatorForAll(Address, Address),
    /// Orden estable de `token_id` por titular (enumeración estilo ERC-721 `tokenOfOwnerByIndex`).
    OwnerTokenList(Address),
}

/// SEP-50: permiso puntual para `transfer_from`.
#[contracttype]
pub struct NftSingleApproval {
    pub approved: Address,
    pub live_until_ledger: u32,
}

#[contracttype]
pub struct X402PaymentRequirement {
    pub token: Address,
    pub amount: i128,
    pub invoice: u32,
    pub facilitator: Address,
}

const ENERGY_BP_PER_SETTLE: u32 = 500;
const ENERGY_BP_MAX: u32 = 10000;

fn str_is_safe_for_json_fragment(s: &String, max_len: u32) -> bool {
    let n = s.len();
    if n > max_len {
        return false;
    }
    if n == 0 {
        return true;
    }
    let nl = n as usize;
    let mut buf = [0u8; 256];
    if nl > buf.len() {
        return false;
    }
    s.copy_into_slice(&mut buf[..nl]);
    for &b in &buf[..nl] {
        if b == b'"' || b == b'\\' || b < 32 {
            return false;
        }
    }
    true
}

/// Base HTTPS donde la app sirve JSON Freighter/SEP (`GET …/api/metadata/{token_id}`).
/// Debe terminar en `/`. Por defecto producción; para ngrok / preview:
/// `PHASE_METADATA_BASE_URL=https://tu-tunel.ngrok-free.app/api/metadata/ cargo build ...`
const DEFAULT_METADATA_BASE_URL: &[u8] = match option_env!("PHASE_METADATA_BASE_URL") {
    Some(url) => url.as_bytes(),
    None => b"https://www.phasee.xyz/api/metadata/",
};

fn u64_to_dec_string(env: &Env, mut n: u64) -> String {
    if n == 0 {
        return String::from_str(env, "0");
    }
    let mut rev = [0u8; 20];
    let mut i = 0usize;
    while n > 0 && i < rev.len() {
        rev[i] = b'0' + (n % 10) as u8;
        n /= 10;
        i += 1;
    }
    let mut out = [0u8; 20];
    for j in 0..i {
        out[j] = rev[i - 1 - j];
    }
    String::from_bytes(env, &out[..i])
}

/// URI del JSON de metadata. Incluye `?c=<contract_id>` para que `/api/metadata/{id}` resuelva
/// el mismo contrato que Freighter aunque el despliegue no coincida con el default del servidor.
fn build_metadata_token_uri(env: &Env, token_id: u64) -> String {
    let mut b = Bytes::from_slice(env, DEFAULT_METADATA_BASE_URL);
    let suf = u64_to_dec_string(env, token_id);
    append_soroban_str_to_bytes(&mut b, &suf);
    append_literal_to_bytes(&mut b, b"?c=");
    let cid = env.current_contract_address().to_string();
    append_soroban_str_to_bytes(&mut b, &cid);
    let bl = b.len() as usize;
    const URI_CAP: usize = 256;
    let mut out = [0u8; URI_CAP];
    if bl > out.len() {
        return String::from_str(env, "");
    }
    b.copy_into_slice(&mut out[..bl]);
    String::from_bytes(env, &out[..bl])
}

fn append_soroban_str_to_bytes(acc: &mut Bytes, s: &String) {
    let n = s.len() as usize;
    if n == 0 {
        return;
    }
    let mut buf = [0u8; 256];
    if n > buf.len() {
        return;
    }
    s.copy_into_slice(&mut buf[..n]);
    acc.extend_from_slice(&buf[..n]);
}

fn append_literal_to_bytes(acc: &mut Bytes, lit: &[u8]) {
    acc.extend_from_slice(lit);
}

fn adjust_nft_balance_count(env: &Env, account: Address, delta: i128) {
    let key = DataKey::Balance(account);
    let cur: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    let next = cur.saturating_add(delta);
    if next <= 0 {
        env.storage().persistent().remove(&key);
    } else {
        env.storage().persistent().set(&key, &next);
    }
}

fn owner_tokens_push(env: &Env, owner: Address, token_id: u64) {
    let key = DataKey::OwnerTokenList(owner.clone());
    let mut v: Vec<u64> = match env.storage().persistent().get(&key) {
        Some(x) => x,
        None => Vec::new(env),
    };
    v.push_back(token_id);
    env.storage().persistent().set(&key, &v);
}

fn owner_tokens_remove(env: &Env, owner: Address, token_id: u64) -> Result<(), PhaseError> {
    let key = DataKey::OwnerTokenList(owner);
    let mut v: Vec<u64> = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(PhaseError::InvalidOwnerTokenList)?;
    let len = v.len();
    if len == 0 {
        return Err(PhaseError::InvalidOwnerTokenList);
    }
    let mut pos: u32 = 0;
    let mut found: Option<u32> = None;
    while pos < len {
        if v.get(pos).ok_or(PhaseError::InvalidOwnerTokenList)? == token_id {
            found = Some(pos);
            break;
        }
        pos += 1;
    }
    let idx = found.ok_or(PhaseError::InvalidOwnerTokenList)?;
    let last = len - 1;
    if idx == last {
        v.pop_back();
    } else {
        let last_tok = v.get(last).ok_or(PhaseError::InvalidOwnerTokenList)?;
        v.set(idx, last_tok);
        v.pop_back();
    }
    if v.is_empty() {
        env.storage().persistent().remove(&key);
    } else {
        env.storage().persistent().set(&key, &v);
    }
    Ok(())
}

/// Convierte `Bytes` acumulados a `String` acotada (límite típico metadatos JSON).
fn bytes_to_bounded_string(env: &Env, b: &Bytes, max: usize) -> String {
    let n = b.len() as usize;
    if n == 0 {
        return String::from_str(env, "");
    }
    let take = n.min(max).min(256);
    let mut buf = [0u8; 256];
    b.copy_into_slice(&mut buf[..take]);
    String::from_bytes(env, &buf[..take])
}

/// `name` alineado con [lib/phase-nft-metadata-build.ts] (colección > 0 + nombre o "Phase").
fn build_token_display_name(env: &Env, token_id: u64) -> String {
    let col_id_opt: Option<u64> = env.storage().persistent().get(&DataKey::TokenCollection(token_id));
    let mut acc = Bytes::from_slice(env, b"");
    match col_id_opt {
        Some(cid) if cid > 0 => {
            let coll_name: String =
                if let Some(settings) = env
                    .storage()
                    .persistent()
                    .get::<DataKey, CollectionSettings>(&DataKey::Collection(cid))
                {
                    if settings.name.len() > 0 {
                        settings.name
                    } else {
                        String::from_str(env, "Phase")
                    }
                } else {
                    String::from_str(env, "Phase")
                };
            append_soroban_str_to_bytes(&mut acc, &coll_name);
            append_literal_to_bytes(&mut acc, b" Artifact #");
        }
        _ => {
            append_literal_to_bytes(&mut acc, b"Phase Artifact #");
        }
    }
    let suf = u64_to_dec_string(env, token_id);
    append_soroban_str_to_bytes(&mut acc, &suf);
    bytes_to_bounded_string(env, &acc, 256)
}

/// `description` alineado con el JSON off-chain (nivel PHASE opcional).
fn build_metadata_description_string(env: &Env, phase_level: Option<String>) -> String {
    let base = String::from_str(env, "Forged on Soroban via x402 AI Protocol");
    match phase_level {
        Some(pl) if pl.len() > 0 => {
            let mut acc = Bytes::from_slice(env, b"");
            append_soroban_str_to_bytes(&mut acc, &base);
            append_literal_to_bytes(&mut acc, b" \xC2\xB7 PHASE level ");
            append_soroban_str_to_bytes(&mut acc, &pl);
            bytes_to_bounded_string(env, &acc, 512)
        }
        _ => base,
    }
}

/// `image`: solo URI on-chain de la colección (sin resolver OG/site; el GET `/api/metadata` puede enriquecer).
fn build_token_image_raw_string(env: &Env, token_id: u64) -> String {
    let col_id_opt: Option<u64> = env.storage().persistent().get(&DataKey::TokenCollection(token_id));
    match col_id_opt {
        Some(cid) if cid > 0 => {
            if let Some(settings) = env
                .storage()
                .persistent()
                .get::<DataKey, CollectionSettings>(&DataKey::Collection(cid))
            {
                settings.image_uri
            } else {
                String::from_str(env, "")
            }
        }
        _ => String::from_str(env, ""),
    }
}

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

/// Eventos alineados con OpenZeppelin / borrador SEP-50 para indexadores y wallets que lean por eventos.
/// SEP-50 mint event: topics=["mint", recipient], data=token_id (u64)
fn emit_indexer_mint(env: &Env, to: Address, token_id: u64) {
    env.events().publish((symbol_short!("mint"), to), token_id);
}

/// SEP-50 transfer event: topics=["transfer", from, to], data=token_id (u64)
fn emit_indexer_transfer(env: &Env, from: Address, to: Address, token_id: u64) {
    env.events().publish((symbol_short!("transfer"), from, to), token_id);
}

fn current_ledger(env: &Env) -> u32 {
    env.ledger().sequence()
}

fn is_approval_live(live_until: u32, env: &Env) -> bool {
    live_until > 0 && live_until >= current_ledger(env)
}

fn get_approved_valid(env: &Env, token_id: u64) -> Option<Address> {
    let a: NftSingleApproval = env.storage().persistent().get(&DataKey::NftApproval(token_id))?;
    if is_approval_live(a.live_until_ledger, env) {
        Some(a.approved)
    } else {
        None
    }
}

fn is_approved_for_all_valid(env: &Env, owner: Address, operator: Address) -> bool {
    let until: u32 = match env
        .storage()
        .persistent()
        .get(&DataKey::OperatorForAll(owner.clone(), operator.clone()))
    {
        Some(u) => u,
        None => return false,
    };
    until > 0 && until >= current_ledger(env)
}

/// SEP-50 approve event: topics=["approve", owner, token_id], data=(approved, live_until_ledger)
fn emit_sep_approve(env: &Env, owner: Address, token_id: u64, approved: Address, live_until: u32) {
    env.events().publish(
        (Symbol::new(env, "approve"), owner, token_id),
        (approved, live_until),
    );
}

fn emit_sep_approve_for_all(env: &Env, owner: Address, operator: Address, live_until: u32) {
    env.events().publish(
        (Symbol::new(env, "approve_for_all"), owner),
        (operator, live_until),
    );
}

#[contract]
pub struct PhaseProtocol;

#[contractimpl]
impl PhaseProtocol {
    /// `protocol_treasury` recibe el 5% de cada settle en colecciones con creador (collection_id > 0).
    pub fn initialize(env: Env, admin: Address, token_address: Address, required_amount: i128, protocol_treasury: Address) {
        admin.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::AuthorizedToken, &token_address);

        env.storage()
            .persistent()
            .set(&DataKey::RequiredAmount, &required_amount);

        env.storage().persistent().set(&DataKey::PhaseCounter, &0u64);

        env.storage()
            .persistent()
            .set(&DataKey::X402InvoiceCounter, &0u32);

        env.storage().persistent().set(&DataKey::CollectionCounter, &0u64);

        env.storage()
            .persistent()
            .set(&DataKey::ProtocolTreasury, &protocol_treasury);

        env.events().publish(
            (Symbol::new(&env, "initialized"), admin.clone()),
            (token_address, required_amount),
        );

        // Store admin for in-place WASM upgrades.
        env.storage().instance().set(&symbol_short!("Admin"), &admin);
    }

    /// Replace the contract WASM in-place (preserves all storage). Only callable by the
    /// admin address stored during `initialize`.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("Admin"))
            .expect("Admin not set — call initialize first");
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Creador registra una colección. Una misma dirección puede tener múltiples colecciones.
    /// Devuelve `collection_id` para `/chamber?collection=ID`.
    pub fn create_collection(
        env: Env,
        creator: Address,
        name: String,
        price: i128,
        image_uri: String,
    ) -> Result<u64, PhaseError> {
        creator.require_auth();

        if price <= 0 {
            return Err(PhaseError::AmountBelowCollectionPrice);
        }

        if !str_is_safe_for_json_fragment(&name, 64) || !str_is_safe_for_json_fragment(&image_uri, 256) {
            return Err(PhaseError::InvalidCollectionMetadata);
        }

        let mut c: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::CollectionCounter)
            .unwrap_or(0);
        c = c.saturating_add(1);

        let settings = CollectionSettings {
            collection_id: c,
            creator: creator.clone(),
            name,
            price,
            image_uri,
        };

        env.storage().persistent().set(&DataKey::Collection(c), &settings);
        env.storage()
            .persistent()
            .set(&DataKey::CollectionCounter, &c);

        // Append to the per-creator list, migrating any pre-existing single-id entry.
        let list_key = DataKey::CreatorCollectionList(creator.clone());
        let mut list: Vec<u64> = env
            .storage()
            .persistent()
            .get(&list_key)
            .unwrap_or_else(|| Vec::new(&env));

        if list.is_empty() {
            // Migrate legacy single-entry from old DataKey::CreatorToCollection if present.
            if let Some(old_id) = env
                .storage()
                .persistent()
                .get::<DataKey, u64>(&DataKey::CreatorToCollection(creator.clone()))
            {
                list.push_back(old_id);
            }
        }

        list.push_back(c);
        env.storage().persistent().set(&list_key, &list);

        env.events().publish(
            (Symbol::new(&env, "collection_created"), creator),
            (c, settings.price),
        );

        Ok(c)
    }

    pub fn get_collection(env: Env, collection_id: u64) -> Option<CollectionSettings> {
        if collection_id == 0 {
            return None;
        }
        env.storage().persistent().get(&DataKey::Collection(collection_id))
    }

    /// Devuelve el primer collection_id del creador (backward compat).
    /// Usa `get_creator_collection_ids` para obtener todos.
    pub fn get_creator_collection_id(env: Env, creator: Address) -> Option<u64> {
        // Prefer the new multi-collection list.
        if let Some(list) = env
            .storage()
            .persistent()
            .get::<DataKey, Vec<u64>>(&DataKey::CreatorCollectionList(creator.clone()))
        {
            return list.first();
        }
        // Fall back to legacy single-entry key.
        env.storage()
            .persistent()
            .get(&DataKey::CreatorToCollection(creator))
    }

    /// Devuelve todos los collection_id del creador (puede ser múltiples).
    pub fn get_creator_collection_ids(env: Env, creator: Address) -> Vec<u64> {
        if let Some(list) = env
            .storage()
            .persistent()
            .get::<DataKey, Vec<u64>>(&DataKey::CreatorCollectionList(creator.clone()))
        {
            return list;
        }
        // Fall back: wrap legacy single-entry if present.
        let mut v: Vec<u64> = Vec::new(&env);
        if let Some(old_id) = env
            .storage()
            .persistent()
            .get::<DataKey, u64>(&DataKey::CreatorToCollection(creator))
        {
            v.push_back(old_id);
        }
        v
    }

    pub fn get_total_collections(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::CollectionCounter)
            .unwrap_or(0)
    }

    fn required_for_collection(env: &Env, collection_id: u64) -> Result<i128, PhaseError> {
        if collection_id == 0 {
            Ok(env
                .storage()
                .persistent()
                .get(&DataKey::RequiredAmount)
                .expect("Required amount not set"))
        } else {
            let s: CollectionSettings = env
                .storage()
                .persistent()
                .get(&DataKey::Collection(collection_id))
                .ok_or(PhaseError::InvalidCollection)?;
            Ok(s.price)
        }
    }

    pub fn initiate_phase(
        env: Env,
        user: Address,
        token_address: Address,
        collection_id: u64,
    ) -> Result<u64, PhaseError> {
        user.require_auth();

        let user_phase_key = DataKey::UserPhase(user.clone(), collection_id);
        if env.storage().persistent().has(&user_phase_key) {
            return Err(PhaseError::AlreadyPhased);
        }

        let authorized_token: Address = env
            .storage()
            .persistent()
            .get(&DataKey::AuthorizedToken)
            .expect("Contract not initialized");

        if token_address != authorized_token {
            return Err(PhaseError::UnauthorizedToken);
        }

        let required_amount = Self::required_for_collection(&env, collection_id)?;

        let token_client = token::Client::new(&env, &token_address);
        let user_balance = token_client.balance(&user);

        if user_balance < required_amount {
            return Err(PhaseError::InsufficientBalance);
        }

        let contract_address = env.current_contract_address();
        token_client.transfer(&user, &contract_address, &required_amount);

        let phase_counter: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::PhaseCounter)
            .unwrap_or(0);

        let new_id = phase_counter + 1;

        let phase_state = PhaseState {
            token_id: new_id,
            collection_id,
            timestamp: env.ledger().timestamp(),
            amount_locked: required_amount,
            token_address: token_address.clone(),
            energy_level_bp: ENERGY_BP_MAX,
            phase_level: String::from_str(&env, "SOLID"),
        };

        env.storage()
            .persistent()
            .set(&user_phase_key, &phase_state);

        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(new_id), &user);

        env.storage()
            .persistent()
            .set(&DataKey::TokenCollection(new_id), &collection_id);

        env.storage().persistent().set(&DataKey::PhaseCounter, &new_id);
        adjust_nft_balance_count(&env, user.clone(), 1);
        owner_tokens_push(&env, user.clone(), new_id);

        env.events().publish(
            (Symbol::new(&env, "phase_initiated"), user.clone()),
            (new_id, required_amount),
        );
        env.events().publish(
            (Symbol::new(&env, "phase_nft_minted"), user.clone()),
            (new_id, required_amount),
        );
        emit_indexer_mint(&env, user, new_id);

        Ok(new_id)
    }

    /// x402 settle. `collection_id == 0`: legado, fondos en contrato. `collection_id > 0`: 95% creador, 5% tesorería PHASE.
    pub fn settle(
        env: Env,
        user: Address,
        token_address: Address,
        amount: i128,
        invoice_id: u32,
        collection_id: u64,
    ) -> Result<bool, PhaseError> {
        let authorized_token: Address = env
            .storage()
            .persistent()
            .get(&DataKey::AuthorizedToken)
            .expect("Contract not initialized");

        if token_address != authorized_token {
            return Err(PhaseError::UnauthorizedToken);
        }

        let payment_key = DataKey::X402Payment(invoice_id);
        if env.storage().persistent().has(&payment_key) {
            let existing: PaymentRecord = env.storage().persistent().get(&payment_key).unwrap();
            if existing.settled {
                return Err(PhaseError::SettlementFailed);
            }
        }

        user.require_auth();

        let min_price = Self::required_for_collection(&env, collection_id)?;
        if amount < min_price {
            return Err(PhaseError::AmountBelowCollectionPrice);
        }

        let token_client = token::Client::new(&env, &token_address);
        let user_balance = token_client.balance(&user);

        if user_balance < amount {
            return Err(PhaseError::InsufficientBalance);
        }

        let contract_address = env.current_contract_address();
        token_client.transfer(&user, &contract_address, &amount);

        if collection_id > 0 {
            let settings: CollectionSettings = env
                .storage()
                .persistent()
                .get(&DataKey::Collection(collection_id))
                .ok_or(PhaseError::InvalidCollection)?;

            let treasury: Address = env
                .storage()
                .persistent()
                .get(&DataKey::ProtocolTreasury)
                .expect("Treasury not set");

            let creator_share = amount * FEE_CREATOR_BP / FEE_DENOM;
            let protocol_share = amount.saturating_sub(creator_share);

            if creator_share > 0 {
                token_client.transfer(&contract_address, &settings.creator, &creator_share);
            }
            if protocol_share > 0 {
                token_client.transfer(&contract_address, &treasury, &protocol_share);
            }
        }

        let payment_record = PaymentRecord {
            invoice_id,
            amount,
            token: token_address.clone(),
            payer: user.clone(),
            settled: true,
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&payment_key, &payment_record);

        let user_phase_key = DataKey::UserPhase(user.clone(), collection_id);
        if env.storage().persistent().has(&user_phase_key) {
            let mut state: PhaseState = env.storage().persistent().get(&user_phase_key).unwrap();
            let next = state
                .energy_level_bp
                .saturating_add(ENERGY_BP_PER_SETTLE);
            state.energy_level_bp = if next > ENERGY_BP_MAX {
                ENERGY_BP_MAX
            } else {
                next
            };
            env.storage().persistent().set(&user_phase_key, &state);
        } else {
            let counter: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::PhaseCounter)
                .unwrap_or(0);
            let new_id = counter + 1;
            let phase_state = PhaseState {
                token_id: new_id,
                collection_id,
                timestamp: env.ledger().timestamp(),
                amount_locked: amount,
                token_address: token_address.clone(),
                energy_level_bp: ENERGY_BP_MAX,
                phase_level: String::from_str(&env, "SOLID"),
            };
            env.storage()
                .persistent()
                .set(&user_phase_key, &phase_state);
            env.storage()
                .persistent()
                .set(&DataKey::TokenOwner(new_id), &user);
            env.storage()
                .persistent()
                .set(&DataKey::TokenCollection(new_id), &collection_id);
            env.storage()
                .persistent()
                .set(&DataKey::PhaseCounter, &new_id);
            adjust_nft_balance_count(&env, user.clone(), 1);
            owner_tokens_push(&env, user.clone(), new_id);

            env.events().publish(
                (Symbol::new(&env, "phase_nft_minted"), user.clone()),
                (new_id, amount),
            );
            env.events().publish(
                (Symbol::new(&env, "phase_minted"), user.clone()),
                (new_id, amount),
            );
            emit_indexer_mint(&env, user.clone(), new_id);
        }

        env.events().publish(
            (Symbol::new(&env, "x402_settled"), user),
            (invoice_id, amount),
        );

        Ok(true)
    }

    pub fn create_invoice(env: Env, amount: i128, token: Address) -> Result<u32, PhaseError> {
        let mut counter: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::X402InvoiceCounter)
            .unwrap_or(0);

        counter = counter + 1;

        env.storage()
            .persistent()
            .set(&DataKey::X402InvoiceCounter, &counter);

        let payment = PaymentRecord {
            invoice_id: counter,
            amount,
            token,
            payer: Address::from_str(&env, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"),
            settled: false,
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::X402Payment(counter), &payment);

        Ok(counter)
    }

    pub fn get_invoice_status(env: Env, invoice_id: u32) -> Option<PaymentRecord> {
        let payment_key = DataKey::X402Payment(invoice_id);
        env.storage().persistent().get(&payment_key)
    }

    pub fn get_user_phase(env: Env, user: Address, collection_id: u64) -> Option<PhaseState> {
        let user_phase_key = DataKey::UserPhase(user, collection_id);
        env.storage().persistent().get(&user_phase_key)
    }

    pub fn has_phased(env: Env, user: Address, collection_id: u64) -> bool {
        let user_phase_key = DataKey::UserPhase(user, collection_id);
        env.storage().persistent().has(&user_phase_key)
    }

    pub fn get_total_phases(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::PhaseCounter)
            .unwrap_or(0)
    }

    /// NFTs emitidos para `collection_id` (recorre `TokenCollection` de `1..=phase_counter`).
    pub fn get_total_minted(env: Env, collection_id: u64) -> u64 {
        let total: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::PhaseCounter)
            .unwrap_or(0);
        let mut count = 0u64;
        let mut id = 1u64;
        while id <= total {
            if let Some(cid) = env
                .storage()
                .persistent()
                .get::<DataKey, u64>(&DataKey::TokenCollection(id))
            {
                if cid == collection_id {
                    count = count.saturating_add(1);
                }
            }
            id = id.saturating_add(1);
        }
        count
    }

    /// Tope de serie para monitor de escasez en UI (constante del protocolo PHASE).
    pub fn get_collection_supply_cap(_env: Env, _collection_id: u64) -> u64 {
        10_000u64
    }

    pub fn get_config(env: Env) -> (Address, i128) {
        let token_address: Address = env
            .storage()
            .persistent()
            .get(&DataKey::AuthorizedToken)
            .expect("Contract not initialized");

        let required_amount: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::RequiredAmount)
            .expect("Required amount not set");

        (token_address, required_amount)
    }

    pub fn get_protocol_treasury(env: Env) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::ProtocolTreasury)
            .expect("Treasury not set")
    }

    pub fn get_facilitator(env: Env) -> Address {
        env.current_contract_address()
    }

    /// Colección (Freighter / SEP-0050 / SEP-41 metadata): lectura on-chain sin estado.
    pub fn name(env: Env) -> String {
        String::from_str(&env, "Phase Artifact")
    }

    /// Símbolo corto del NFT de utilidad (Freighter collectibles).
    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "PHASE")
    }

    // --- FUNCIONES ESTÁNDAR SEP-41 REQUERIDAS POR FREIGHTER ---

    /// Freighter usa esto para saber si el token es divisible. NFT → 0.
    pub fn decimals(env: Env) -> u32 {
        let _ = env;
        0
    }

    pub fn get_phase_level(env: Env, token_id: u64) -> Option<String> {
        let owner: Address = env.storage().persistent().get(&DataKey::TokenOwner(token_id))?;
        let col: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::TokenCollection(token_id))?;
        let state: PhaseState = env
            .storage()
            .persistent()
            .get(&DataKey::UserPhase(owner, col))?;
        if state.token_id == token_id {
            Some(state.phase_level)
        } else {
            None
        }
    }

    /// Freighter: cuántos NFTs tiene la cuenta en total (contador persistente, misma clave que el mint/transfer mantienen).
    pub fn balance(env: Env, id: Address) -> i128 {
        let key = DataKey::Balance(id);
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    /// Enumeración por titular (ERC-721 `tokenOfOwnerByIndex`): `index` en `[0, balance(owner))`.
    /// Orden estable por orden de incorporación a la lista del dueño (mint / recepción por transfer).
    pub fn token_of_owner_by_index(env: Env, owner: Address, index: u32) -> Option<u64> {
        let key = DataKey::OwnerTokenList(owner);
        let v: Vec<u64> = env.storage().persistent().get(&key)?;
        if index >= v.len() {
            return None;
        }
        v.get(index)
    }

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

    /// `token_id` → `collection_id` (0 = pool protocolo). Lectura para indexadores y `/api/metadata`.
    pub fn get_token_collection_id(env: Env, token_id: u64) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::TokenCollection(token_id))
    }

    /// Alias **SEP-41 / Freighter**: misma firma que suelen exponer los NFT Soroban para descubrimiento en wallet.
    /// Si `from == to`, es un **no-op** autenticado (el token sigue en la misma cuenta) para forzar una tx visible
    /// al indexador cuando el mint existió pero la wallet no mostraba el collectible.
    pub fn transfer(env: Env, from: Address, to: Address, token_id: u64) -> Result<(), PhaseError> {
        if from == to {
            from.require_auth();
            let current: Address = env
                .storage()
                .persistent()
                .get(&DataKey::TokenOwner(token_id))
                .ok_or(PhaseError::NftNotFound)?;
            if current != from {
                return Err(PhaseError::NotNftOwner);
            }
            emit_indexer_transfer(&env, from.clone(), to.clone(), token_id);
            return Ok(());
        }
        Self::transfer_phase_nft(env, from, to, token_id)
    }

    /// Mismo comportamiento que `transfer`; nombre usado en varios ejemplos / tooling Soroban (`xfer`).
    pub fn xfer(env: Env, from: Address, to: Address, token_id: u64) -> Result<(), PhaseError> {
        Self::transfer(env, from, to, token_id)
    }

    /// Cuerpo común de transferencia de NFT (SEP-50: `transfer` / `transfer_from`); limpia `NftApproval`.
    fn transfer_phase_nft_body(env: &Env, from: Address, to: Address, token_id: u64) -> Result<(), PhaseError> {
        if from == to {
            return Err(PhaseError::SelfTransfer);
        }
        let current: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
            .ok_or(PhaseError::NftNotFound)?;
        if current != from {
            return Err(PhaseError::NotNftOwner);
        }
        let collection_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::TokenCollection(token_id))
            .ok_or(PhaseError::NftNotFound)?;
        let state: PhaseState = env
            .storage()
            .persistent()
            .get(&DataKey::UserPhase(from.clone(), collection_id))
            .ok_or(PhaseError::NftNotFound)?;
        if state.token_id != token_id {
            return Err(PhaseError::NftNotFound);
        }
        owner_tokens_remove(env, from.clone(), token_id)?;
        adjust_nft_balance_count(env, from.clone(), -1);
        adjust_nft_balance_count(env, to.clone(), 1);
        env.storage()
            .persistent()
            .remove(&DataKey::UserPhase(from.clone(), collection_id));
        env.storage().persistent().set(&DataKey::TokenOwner(token_id), &to);
        env.storage()
            .persistent()
            .set(&DataKey::UserPhase(to.clone(), collection_id), &state);
        env.storage().persistent().remove(&DataKey::NftApproval(token_id));
        owner_tokens_push(env, to.clone(), token_id);
        Ok(())
    }

    /// Transfiere el NFT de utilidad PHASE a otra cuenta. El pago en PHASER_LIQ se acuerda P2P;
    /// esta llamada solo mueve la propiedad on-chain (`TokenOwner` + `UserPhase`).
    pub fn transfer_phase_nft(env: Env, from: Address, to: Address, token_id: u64) -> Result<(), PhaseError> {
        from.require_auth();
        Self::transfer_phase_nft_body(&env, from.clone(), to.clone(), token_id)?;
        env.events().publish(
            (Symbol::new(&env, "phase_nft_transferred"), from.clone()),
            (token_id, to.clone()),
        );
        emit_indexer_transfer(&env, from, to, token_id);
        Ok(())
    }

    /// SEP-50: tercero autorizado (`spender`) transfiere en nombre del dueño.
    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        token_id: u64,
    ) -> Result<(), PhaseError> {
        spender.require_auth();
        if from == to {
            return Err(PhaseError::SelfTransfer);
        }
        let owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
            .ok_or(PhaseError::NftNotFound)?;
        if owner != from {
            return Err(PhaseError::NotNftOwner);
        }
        let allowed = spender == from
            || get_approved_valid(&env, token_id).as_ref() == Some(&spender)
            || is_approved_for_all_valid(&env, from.clone(), spender.clone());
        if !allowed {
            return Err(PhaseError::NotApproved);
        }
        Self::transfer_phase_nft_body(&env, from.clone(), to.clone(), token_id)?;
        env.events().publish(
            (Symbol::new(&env, "phase_nft_transferred"), from.clone()),
            (token_id, to.clone()),
        );
        emit_indexer_transfer(&env, from, to, token_id);
        Ok(())
    }

    /// SEP-50: permiso puntual para `transfer_from`.
    pub fn approve(
        env: Env,
        approver: Address,
        approved: Address,
        token_id: u64,
        live_until_ledger: u32,
    ) -> Result<(), PhaseError> {
        approver.require_auth();
        let owner: Address = Self::owner_of(env.clone(), token_id as u32);
        let can_approve = approver == owner || is_approved_for_all_valid(&env, owner.clone(), approver.clone());
        if !can_approve {
            return Err(PhaseError::UnauthorizedApprover);
        }
        if live_until_ledger != 0 && live_until_ledger < current_ledger(&env) {
            return Err(PhaseError::InvalidApproval);
        }
        if live_until_ledger == 0 {
            env.storage().persistent().remove(&DataKey::NftApproval(token_id));
        } else {
            env.storage().persistent().set(
                &DataKey::NftApproval(token_id),
                &NftSingleApproval {
                    approved: approved.clone(),
                    live_until_ledger,
                },
            );
        }
        emit_sep_approve(&env, owner, token_id, approved, live_until_ledger);
        Ok(())
    }

    /// SEP-50: operador para todos los NFT del `owner`.
    pub fn approve_for_all(
        env: Env,
        owner: Address,
        operator: Address,
        live_until_ledger: u32,
    ) -> Result<(), PhaseError> {
        owner.require_auth();
        if live_until_ledger != 0 && live_until_ledger < current_ledger(&env) {
            return Err(PhaseError::InvalidApproval);
        }
        if live_until_ledger == 0 {
            env.storage()
                .persistent()
                .remove(&DataKey::OperatorForAll(owner.clone(), operator.clone()));
        } else {
            env.storage().persistent().set(
                &DataKey::OperatorForAll(owner.clone(), operator.clone()),
                &live_until_ledger,
            );
        }
        emit_sep_approve_for_all(&env, owner.clone(), operator.clone(), live_until_ledger);
        Ok(())
    }

    /// SEP-50: cuenta permitida para `token_id` (expirada ⇒ `None`).
    pub fn get_approved(env: Env, token_id: u64) -> Option<Address> {
        if env
            .storage()
            .persistent()
            .get::<DataKey, Address>(&DataKey::TokenOwner(token_id))
            .is_none()
        {
            panic!("Phase NFT: invalid token id");
        }
        get_approved_valid(&env, token_id)
    }

    /// SEP-50: `operator` puede gestionar todos los activos de `owner`.
    pub fn is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool {
        is_approved_for_all_valid(&env, owner, operator)
    }

    pub fn total_supply(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::PhaseCounter)
            .unwrap_or(0)
    }

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

    pub fn get_energy_level_bp(env: Env, user: Address, collection_id: u64) -> Option<u32> {
        let key = DataKey::UserPhase(user, collection_id);
        env.storage()
            .persistent()
            .get::<DataKey, PhaseState>(&key)
            .map(|s| s.energy_level_bp)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
}
