import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Environment = 'development' | 'staging' | 'production';

export interface SecretMetadata {
  key: string;
  env: Environment;
  version: number;
  createdAt: number;
  rotatedAt: number | null;
  /** Rotation interval in ms; null = no auto-rotation */
  rotationIntervalMs: number | null;
  /** Whether this secret has been soft-deleted */
  deleted: boolean;
}

export interface SecretEntry {
  meta: SecretMetadata;
  /** Obfuscated value stored in AsyncStorage (base64) */
  value: string;
}

export interface AuditEvent {
  action: 'set' | 'get' | 'rotate' | 'delete' | 'recover' | 'inject';
  key: string;
  env: Environment;
  timestamp: number;
  success: boolean;
  reason?: string;
}

export interface InjectedSecrets {
  STELLAR_NETWORK: string;
  CONTRACT_ID: string;
  WEB3AUTH_CLIENT_ID: string;
  [key: string]: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAULT_PREFIX = '@subtrackr:secrets:';
const AUDIT_KEY = '@subtrackr:secrets:audit';
const INDEX_KEY = '@subtrackr:secrets:index';
const MAX_AUDIT_EVENTS = 1000;

// ---------------------------------------------------------------------------
// Minimal obfuscation (base64) — keeps values out of plain-text logs.
// For production-grade encryption, replace with expo-crypto AES-GCM.
// ---------------------------------------------------------------------------

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function decode(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

function storageKey(key: string, env: Environment): string {
  return `${VAULT_PREFIX}${env}:${key}`;
}

// ---------------------------------------------------------------------------
// SecretsVault
// ---------------------------------------------------------------------------

export class SecretsVault {
  private readonly currentEnv: Environment;

  constructor(env: Environment = 'development') {
    this.currentEnv = env;
  }

  // ── Set / Get ─────────────────────────────────────────────────────────────

  async set(
    key: string,
    value: string,
    options: { env?: Environment; rotationIntervalMs?: number } = {}
  ): Promise<SecretMetadata> {
    const env = options.env ?? this.currentEnv;
    const existing = await this._load(key, env);
    const version = existing ? existing.meta.version + 1 : 1;

    const meta: SecretMetadata = {
      key,
      env,
      version,
      createdAt: existing?.meta.createdAt ?? Date.now(),
      rotatedAt: version > 1 ? Date.now() : null,
      rotationIntervalMs: options.rotationIntervalMs ?? existing?.meta.rotationIntervalMs ?? null,
      deleted: false,
    };

    const entry: SecretEntry = { meta, value: encode(value) };
    await AsyncStorage.setItem(storageKey(key, env), JSON.stringify(entry));
    await this._updateIndex(meta);
    await this._audit({ action: version > 1 ? 'rotate' : 'set', key, env, success: true });
    return meta;
  }

  async get(key: string, env?: Environment): Promise<string | null> {
    const resolvedEnv = env ?? this.currentEnv;
    const entry = await this._load(key, resolvedEnv);
    if (!entry || entry.meta.deleted) {
      await this._audit({
        action: 'get',
        key,
        env: resolvedEnv,
        success: false,
        reason: 'not found or deleted',
      });
      return null;
    }
    await this._audit({ action: 'get', key, env: resolvedEnv, success: true });
    return decode(entry.value);
  }

  // ── Rotation ──────────────────────────────────────────────────────────────

  /** Rotate a secret to a new value, incrementing its version */
  async rotate(key: string, newValue: string, env?: Environment): Promise<SecretMetadata> {
    const resolvedEnv = env ?? this.currentEnv;
    const existing = await this._load(key, resolvedEnv);
    if (!existing || existing.meta.deleted) {
      await this._audit({
        action: 'rotate',
        key,
        env: resolvedEnv,
        success: false,
        reason: 'secret not found',
      });
      throw new Error(`Secret "${key}" not found in ${resolvedEnv}`);
    }
    return this.set(key, newValue, {
      env: resolvedEnv,
      rotationIntervalMs: existing.meta.rotationIntervalMs ?? undefined,
    });
  }

  /** Returns secrets whose rotation interval has elapsed */
  async getDueForRotation(env?: Environment): Promise<SecretMetadata[]> {
    const resolvedEnv = env ?? this.currentEnv;
    const index = await this._getIndex();
    const now = Date.now();
    return index.filter(
      (m) =>
        m.env === resolvedEnv &&
        !m.deleted &&
        m.rotationIntervalMs !== null &&
        now - (m.rotatedAt ?? m.createdAt) >= m.rotationIntervalMs
    );
  }

  // ── Environment-specific secrets ──────────────────────────────────────────

  /** List all non-deleted secrets for a given environment */
  async listByEnv(env?: Environment): Promise<SecretMetadata[]> {
    const resolvedEnv = env ?? this.currentEnv;
    const index = await this._getIndex();
    return index.filter((m) => m.env === resolvedEnv && !m.deleted);
  }

  // ── Secrets injection ─────────────────────────────────────────────────────

  /**
   * Inject all secrets for the current environment into a flat object.
   * Use this to populate app config at startup.
   */
  async inject(env?: Environment): Promise<Partial<InjectedSecrets>> {
    const resolvedEnv = env ?? this.currentEnv;
    const metas = await this.listByEnv(resolvedEnv);
    const result: Partial<InjectedSecrets> = {};
    for (const meta of metas) {
      const value = await this.get(meta.key, resolvedEnv);
      if (value !== null) result[meta.key] = value;
    }
    await this._audit({ action: 'inject', key: '*', env: resolvedEnv, success: true });
    return result;
  }

  // ── Soft delete ───────────────────────────────────────────────────────────

  async delete(key: string, env?: Environment): Promise<void> {
    const resolvedEnv = env ?? this.currentEnv;
    const entry = await this._load(key, resolvedEnv);
    if (!entry) return;
    entry.meta.deleted = true;
    await AsyncStorage.setItem(storageKey(key, resolvedEnv), JSON.stringify(entry));
    await this._updateIndex(entry.meta);
    await this._audit({ action: 'delete', key, env: resolvedEnv, success: true });
  }

  // ── Recovery ──────────────────────────────────────────────────────────────

  /** Recover a soft-deleted secret */
  async recover(key: string, env?: Environment): Promise<SecretMetadata> {
    const resolvedEnv = env ?? this.currentEnv;
    const entry = await this._load(key, resolvedEnv);
    if (!entry) {
      await this._audit({
        action: 'recover',
        key,
        env: resolvedEnv,
        success: false,
        reason: 'not found',
      });
      throw new Error(`Secret "${key}" not found in ${resolvedEnv}`);
    }
    entry.meta.deleted = false;
    await AsyncStorage.setItem(storageKey(key, resolvedEnv), JSON.stringify(entry));
    await this._updateIndex(entry.meta);
    await this._audit({ action: 'recover', key, env: resolvedEnv, success: true });
    return entry.meta;
  }

  // ── Audit log ─────────────────────────────────────────────────────────────

  async getAuditLog(limit = 100): Promise<AuditEvent[]> {
    const raw = await AsyncStorage.getItem(AUDIT_KEY);
    const events: AuditEvent[] = raw ? JSON.parse(raw) : [];
    return events.slice(-limit);
  }

  async clearAuditLog(): Promise<void> {
    await AsyncStorage.removeItem(AUDIT_KEY);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _load(key: string, env: Environment): Promise<SecretEntry | null> {
    const raw = await AsyncStorage.getItem(storageKey(key, env));
    return raw ? (JSON.parse(raw) as SecretEntry) : null;
  }

  private async _getIndex(): Promise<SecretMetadata[]> {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as SecretMetadata[]) : [];
  }

  private async _updateIndex(meta: SecretMetadata): Promise<void> {
    const index = await this._getIndex();
    const idx = index.findIndex((m) => m.key === meta.key && m.env === meta.env);
    if (idx >= 0) index[idx] = meta;
    else index.push(meta);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  private async _audit(event: Omit<AuditEvent, 'timestamp'>): Promise<void> {
    const raw = await AsyncStorage.getItem(AUDIT_KEY);
    const events: AuditEvent[] = raw ? JSON.parse(raw) : [];
    events.push({ ...event, timestamp: Date.now() });
    if (events.length > MAX_AUDIT_EVENTS) events.splice(0, events.length - MAX_AUDIT_EVENTS);
    await AsyncStorage.setItem(AUDIT_KEY, JSON.stringify(events));
  }
}

export const secretsVault = new SecretsVault(
  (process.env['APP_ENV'] as Environment | undefined) ?? 'development'
);
