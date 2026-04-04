#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Bytes, Env, String, Symbol,
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
}

/// Configuración de una colección creada por un usuario (factory).
#[contracttype]
pub struct CollectionSettings {
    pub collection_id: u64,
    pub creator: Address,
    pub name: String,
    /// Precio en unidades mínimas del token LIQ (x402)
    pub price: i128,
    /// URL de arte (IPFS/https) embebida en `token_uri` JSON; sin `"` ni `\` (ASCII imprimible ≥32).
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

/// Tamaño máximo serializado de `token_uri` (bytes).
const TOKEN_URI_CAP: u32 = 768;

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
    ProtocolTreasury,
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
            (Symbol::new(&env, "initialized"), admin),
            (token_address, required_amount),
        );
    }

    /// Creador registra una colección (una por dirección). Devuelve `collection_id` para `/chamber?collection=ID`.
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

        let ck = DataKey::CreatorToCollection(creator.clone());
        if env.storage().persistent().has(&ck) {
            return Err(PhaseError::CreatorAlreadyHasCollection);
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
        env.storage().persistent().set(&ck, &c);
        env.storage()
            .persistent()
            .set(&DataKey::CollectionCounter, &c);

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

    pub fn get_creator_collection_id(env: Env, creator: Address) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::CreatorToCollection(creator))
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

        env.events().publish(
            (Symbol::new(&env, "phase_initiated"), user.clone()),
            (new_id, required_amount),
        );
        env.events().publish(
            (Symbol::new(&env, "phase_nft_minted"), user),
            (new_id, required_amount),
        );

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

            env.events().publish(
                (Symbol::new(&env, "phase_nft_minted"), user.clone()),
                (new_id, amount),
            );
            env.events().publish(
                (Symbol::new(&env, "phase_minted"), user.clone()),
                (new_id, amount),
            );
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

    pub fn name(env: Env) -> String {
        String::from_str(&env, "PHASE Utility Artifact")
    }

    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "PHASE")
    }

    pub fn decimals(_env: Env) -> u32 {
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

    pub fn balance(env: Env, owner: Address) -> i128 {
        let total: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::PhaseCounter)
            .unwrap_or(0);

        let mut count: i128 = 0;
        let mut id = 1u64;
        while id <= total {
            if let Some(token_owner) = env
                .storage()
                .persistent()
                .get::<DataKey, Address>(&DataKey::TokenOwner(id))
            {
                if token_owner == owner {
                    count = count.saturating_add(1);
                }
            }
            id = id.saturating_add(1);
        }
        count
    }

    pub fn owner_of(env: Env, token_id: u64) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
    }

    /// Transfiere el NFT de utilidad PHASE a otra cuenta. El pago en PHASER_LIQ se acuerda P2P;
    /// esta llamada solo mueve la propiedad on-chain (`TokenOwner` + `UserPhase`).
    pub fn transfer_phase_nft(env: Env, from: Address, to: Address, token_id: u64) -> Result<(), PhaseError> {
        from.require_auth();
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
        env
            .storage()
            .persistent()
            .remove(&DataKey::UserPhase(from.clone(), collection_id));
        env.storage().persistent().set(&DataKey::TokenOwner(token_id), &to);
        env
            .storage()
            .persistent()
            .set(&DataKey::UserPhase(to.clone(), collection_id), &state);
        env.events().publish(
            (Symbol::new(&env, "phase_nft_transferred"), from),
            (token_id, to),
        );
        Ok(())
    }

    pub fn total_supply(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::PhaseCounter)
            .unwrap_or(0)
    }

    pub fn token_uri(env: Env, token_id: u64) -> Option<String> {
        let owner: Address = env.storage().persistent().get(&DataKey::TokenOwner(token_id))?;
        let collection_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::TokenCollection(token_id))?;
        let state: PhaseState = env
            .storage()
            .persistent()
            .get(&DataKey::UserPhase(owner, collection_id))?;

        if !str_is_safe_for_json_fragment(&state.phase_level, 32) {
            return None;
        }

        let (meta_name, meta_img) = if collection_id > 0 {
            match env
                .storage()
                .persistent()
                .get::<DataKey, CollectionSettings>(&DataKey::Collection(collection_id))
            {
                Some(st) => (st.name, st.image_uri),
                None => (
                    String::from_str(&env, "PHASE Utility Artifact"),
                    String::from_str(&env, ""),
                ),
            }
        } else {
            (
                String::from_str(&env, "PHASE Utility Artifact"),
                String::from_str(&env, ""),
            )
        };

        let mut b = Bytes::from_slice(&env, b"{\"standard\":\"SEP-20\",\"image\":\"");
        append_soroban_str_to_bytes(&mut b, &meta_img);
        b.extend_from_slice(b"\",\"name\":\"");
        append_soroban_str_to_bytes(&mut b, &meta_name);
        b.extend_from_slice(b"\",\"attributes\":[{\"trait_type\":\"PHASE_LEVEL\",\"value\":\"");
        append_soroban_str_to_bytes(&mut b, &state.phase_level);
        b.extend_from_slice(b"\"}]}");

        if b.len() > TOKEN_URI_CAP {
            return None;
        }

        let bl = b.len() as usize;
        let mut out = [0u8; 768];
        if bl > out.len() {
            return None;
        }
        b.copy_into_slice(&mut out[..bl]);
        Some(String::from_bytes(&env, &out[..bl]))
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
