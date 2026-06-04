/**
 * Fake en memoria del pool de Postgres para los tests de rutas.
 *
 * Implementa solo las consultas que ejecutan las rutas de two_factor.ts
 * (WebAuthn, login con passkey, step-up). El router casa por fragmentos
 * estables del SQL; si llega una consulta no contemplada, lanza para que el
 * test la delate en vez de devolver un falso vacío silencioso.
 *
 * El objetivo NO es emular Postgres, sino dar a las rutas un almacén con la
 * semántica justa: un solo uso del challenge, unicidad de credential_id,
 * filtro de revocadas. Reemplaza a ../db/pool.js vía vi.mock.
 */
import { randomUUID } from 'node:crypto';

export interface FakeUser {
  id: string;
  username: string;
  email_hash: Buffer;
  identity_public_key: Buffer | null;
  two_factor_email_enabled: boolean;
  email_verified: boolean;
  // Recovery (v1 + v2)
  recovery_enabled: boolean;
  recovery_public_key: Buffer | null;
  recovery_box_public_key: Buffer | null;
  recovery_kdf_salt: Buffer | null;
  exchange_public_key: Buffer | null;
  exchange_private_key_sealed_recovery: Buffer | null;
  // Campos que escribe recovery/finalize (para asserts)
  opaque_record: Buffer | null;
  kdf_salt: Buffer | null;
  kdf_ops_limit: number | null;
  kdf_mem_limit: number | null;
  identity_private_key_wrapped: Buffer | null;
  identity_private_key_nonce: Buffer | null;
  exchange_private_key_wrapped: Buffer | null;
  exchange_private_key_nonce: Buffer | null;
}

export interface FakeVault {
  id: string;
  owner_id: string;
  vault_key_wrapped: Buffer;
  vault_key_nonce: Buffer;
  vault_key_sealed_recovery: Buffer | null;
}

interface ResetTokenRow {
  id: string;
  user_id: string;
  token_hash: Buffer;
  expires_at: Date;
  used_at: Date | null;
}

interface ChallengeRow {
  id: string;
  user_id: string;
  challenge: Buffer;
  purpose: string;
  expires_at: Date;
  seq: number;
}

interface CredentialRow {
  id: string;
  user_id: string;
  credential_id: Buffer;
  public_key: Buffer;
  counter: number;
  transports: string[];
  device_type: string | null;
  backed_up: boolean;
  nickname: string | null;
  last_used_at: Date | null;
  created_at: number;
  revoked_at: Date | null;
}

class Store {
  users = new Map<string, FakeUser>();
  challenges: ChallengeRow[] = [];
  credentials: CredentialRow[] = [];
  agents: any[] = [];
  pairingTokens: any[] = [];
  volumes: any[] = [];
  chunks: any[] = [];
  vaults: FakeVault[] = [];
  resetTokens: ResetTokenRow[] = [];
  revokedSessionsFor: string[] = [];
  private seq = 0;

  reset(): void {
    this.users.clear();
    this.challenges = [];
    this.credentials = [];
    this.agents = [];
    this.pairingTokens = [];
    this.volumes = [];
    this.chunks = [];
    this.vaults = [];
    this.resetTokens = [];
    this.revokedSessionsFor = [];
    this.seq = 0;
  }

  nextSeq(): number {
    return ++this.seq;
  }
}

export const store = new Store();

const asBuf = (v: unknown): Buffer => (Buffer.isBuffer(v) ? v : Buffer.from(v as any));
const norm = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

type QueryResult = { rows: any[]; rowCount: number };

async function query(text: string, params: any[] = []): Promise<QueryResult> {
  const sql = norm(text);

  // ─── webauthn_challenges ──────────────────────────────────
  if (sql.startsWith('INSERT INTO webauthn_challenges')) {
    const purpose = /'(registration|authentication|step-up|change-password)'/.exec(sql)?.[1] ?? 'unknown';
    store.challenges.push({
      id: randomUUID(),
      user_id: params[0],
      challenge: asBuf(params[1]),
      purpose,
      expires_at: params[2] as Date,
      seq: store.nextSeq(),
    });
    return { rows: [], rowCount: 1 };
  }

  // consumeChallenge(): borra el challenge más reciente y válido del propósito.
  if (sql.startsWith('DELETE FROM webauthn_challenges') && sql.includes('SELECT id FROM webauthn_challenges')) {
    const [userId, purpose] = params;
    const now = Date.now();
    const candidates = store.challenges
      .filter((c) => c.user_id === userId && c.purpose === purpose && c.expires_at.getTime() > now)
      .sort((a, b) => b.seq - a.seq);
    const target = candidates[0];
    if (!target) return { rows: [], rowCount: 0 };
    store.challenges = store.challenges.filter((c) => c.id !== target.id);
    return { rows: [{ challenge: target.challenge }], rowCount: 1 };
  }

  // step-up/finish y change-password/finalize: consumen el challenge exacto.
  if (sql.startsWith('DELETE FROM webauthn_challenges') && sql.includes('challenge = $2')) {
    const purpose = /purpose = '([\w-]+)'/.exec(sql)?.[1] ?? '';
    const [userId, challenge] = params;
    const buf = asBuf(challenge);
    const now = Date.now();
    const target = store.challenges.find(
      (c) => c.user_id === userId && c.purpose === purpose && c.challenge.equals(buf) && c.expires_at.getTime() > now,
    );
    if (!target) return { rows: [], rowCount: 0 };
    store.challenges = store.challenges.filter((c) => c.id !== target.id);
    return { rows: [{ id: target.id }], rowCount: 1 };
  }

  // ─── webauthn_credentials ─────────────────────────────────
  if (sql.startsWith('INSERT INTO webauthn_credentials')) {
    const credId = asBuf(params[1]);
    const exists = store.credentials.some((c) => c.credential_id.equals(credId));
    if (exists) return { rows: [], rowCount: 0 }; // ON CONFLICT DO NOTHING
    store.credentials.push({
      id: randomUUID(),
      user_id: params[0],
      credential_id: credId,
      public_key: asBuf(params[2]),
      counter: Number(params[3]),
      transports: params[4] ?? [],
      device_type: params[5] ?? null,
      backed_up: Boolean(params[6]),
      nickname: params[7] ?? null,
      last_used_at: null,
      created_at: store.nextSeq(),
      revoked_at: null,
    });
    return { rows: [], rowCount: 1 };
  }

  // verifyAssertion(): localiza la credencial por credential_id.
  if (sql.includes('FROM webauthn_credentials') && sql.includes('public_key') && sql.includes('credential_id = $1')) {
    const credId = asBuf(params[0]);
    const cred = store.credentials.find((c) => c.credential_id.equals(credId) && c.revoked_at === null);
    if (!cred) return { rows: [], rowCount: 0 };
    return {
      rows: [{
        id: cred.id,
        user_id: cred.user_id,
        public_key: cred.public_key,
        counter: cred.counter,
        transports: cred.transports,
      }],
      rowCount: 1,
    };
  }

  // authenticate/begin: lista credential_id + transports del usuario.
  if (sql.includes('SELECT credential_id, transports FROM webauthn_credentials')) {
    const userId = params[0];
    const rows = store.credentials
      .filter((c) => c.user_id === userId && c.revoked_at === null)
      .map((c) => ({ credential_id: c.credential_id, transports: c.transports }));
    return { rows, rowCount: rows.length };
  }

  // Actualiza el counter tras una assertion válida.
  if (sql.startsWith('UPDATE webauthn_credentials SET counter')) {
    const [counter, id] = params;
    const cred = store.credentials.find((c) => c.id === id);
    if (cred) {
      cred.counter = Number(counter);
      cred.last_used_at = new Date();
    }
    return { rows: [], rowCount: cred ? 1 : 0 };
  }

  // DELETE /webauthn/:id → revoca.
  if (sql.startsWith('UPDATE webauthn_credentials SET revoked_at')) {
    const [id, userId] = params;
    const cred = store.credentials.find((c) => c.id === id && c.user_id === userId && c.revoked_at === null);
    if (cred) cred.revoked_at = new Date();
    return { rows: [], rowCount: cred ? 1 : 0 };
  }

  // GET /webauthn → lista passkeys del usuario.
  if (sql.includes('FROM webauthn_credentials') && sql.includes('nickname') && sql.includes('ORDER BY created_at')) {
    const userId = params[0];
    const rows = store.credentials
      .filter((c) => c.user_id === userId && c.revoked_at === null)
      .sort((a, b) => b.created_at - a.created_at)
      .map((c) => ({
        id: c.id,
        nickname: c.nickname,
        device_type: c.device_type,
        last_used_at: c.last_used_at,
        created_at: c.created_at,
      }));
    return { rows, rowCount: rows.length };
  }

  // ─── change-password (auth.ts) ────────────────────────────
  // begin: params KDF actuales del usuario.
  if (sql.startsWith('SELECT kdf_salt, kdf_ops_limit, kdf_mem_limit FROM users')) {
    const u = store.users.get(params[0]);
    return u
      ? { rows: [{ kdf_salt: u.kdf_salt, kdf_ops_limit: u.kdf_ops_limit, kdf_mem_limit: u.kdf_mem_limit }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  }

  // finalize: reemplaza claves (mismo prefijo que recovery pero re-envuelve la
  // exchange PRIVADA, no la pública; lo distingue 'updated_at = now()').
  if (sql.startsWith('UPDATE users SET') && sql.includes('opaque_record = $1') && sql.includes('updated_at = now()')) {
    const u = store.users.get(params[9]);
    if (!u) return { rows: [], rowCount: 0 };
    u.opaque_record = asBuf(params[0]);
    u.kdf_salt = asBuf(params[1]);
    u.kdf_ops_limit = Number(params[2]);
    u.kdf_mem_limit = Number(params[3]);
    u.identity_public_key = asBuf(params[4]);
    u.identity_private_key_wrapped = asBuf(params[5]);
    u.identity_private_key_nonce = asBuf(params[6]);
    u.exchange_private_key_wrapped = asBuf(params[7]);
    u.exchange_private_key_nonce = asBuf(params[8]);
    return { rows: [], rowCount: 1 };
  }

  // ─── recovery (two_factor.ts) ─────────────────────────────
  // /recovery/init: salt + enabled por email_hash.
  if (sql.startsWith('SELECT id, recovery_kdf_salt, recovery_enabled FROM users')) {
    const eh = asBuf(params[0]);
    const u = [...store.users.values()].find((x) => x.email_hash.equals(eh));
    return u
      ? { rows: [{ id: u.id, recovery_kdf_salt: u.recovery_kdf_salt, recovery_enabled: u.recovery_enabled }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  }

  // verifyRecoveryProof(): fila completa de recovery por email_hash.
  if (sql.startsWith('SELECT id, recovery_public_key, recovery_enabled, recovery_box_public_key')) {
    const eh = asBuf(params[0]);
    const u = [...store.users.values()].find((x) => x.email_hash.equals(eh));
    if (!u) return { rows: [], rowCount: 0 };
    return {
      rows: [{
        id: u.id,
        recovery_public_key: u.recovery_public_key,
        recovery_enabled: u.recovery_enabled,
        recovery_box_public_key: u.recovery_box_public_key,
        exchange_public_key: u.exchange_public_key,
        exchange_private_key_sealed_recovery: u.exchange_private_key_sealed_recovery,
      }],
      rowCount: 1,
    };
  }

  if (sql.startsWith('INSERT INTO password_reset_tokens')) {
    store.resetTokens.push({
      id: randomUUID(),
      user_id: params[0],
      token_hash: asBuf(params[1]),
      expires_at: params[2] as Date,
      used_at: null,
    });
    return { rows: [], rowCount: 1 };
  }

  if (sql.startsWith('SELECT id FROM password_reset_tokens')) {
    const [userId, tokenHash] = params;
    const hash = asBuf(tokenHash);
    const now = Date.now();
    const t = store.resetTokens.find(
      (x) => x.user_id === userId && x.token_hash.equals(hash) && x.used_at === null && x.expires_at.getTime() > now,
    );
    return t ? { rows: [{ id: t.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }

  if (sql.startsWith('UPDATE password_reset_tokens SET used_at')) {
    const t = store.resetTokens.find((x) => x.id === params[0]);
    if (t) t.used_at = new Date();
    return { rows: [], rowCount: t ? 1 : 0 };
  }

  if (sql.startsWith('UPDATE sessions SET revoked_at')) {
    store.revokedSessionsFor.push(params[0]);
    return { rows: [], rowCount: 1 };
  }

  // /recovery/unlock: vault keys selladas del owner.
  if (sql.startsWith('SELECT id, vault_key_sealed_recovery FROM vaults')) {
    const rows = store.vaults
      .filter((v) => v.owner_id === params[0] && v.vault_key_sealed_recovery !== null)
      .map((v) => ({ id: v.id, vault_key_sealed_recovery: v.vault_key_sealed_recovery }));
    return { rows, rowCount: rows.length };
  }

  // /recovery/finalize: reemplaza claves del usuario.
  if (sql.startsWith('UPDATE users SET opaque_record = $1')) {
    const u = store.users.get(params[10]);
    if (!u) return { rows: [], rowCount: 0 };
    u.opaque_record = asBuf(params[0]);
    u.kdf_salt = asBuf(params[1]);
    u.kdf_ops_limit = Number(params[2]);
    u.kdf_mem_limit = Number(params[3]);
    u.identity_public_key = asBuf(params[4]);
    u.identity_private_key_wrapped = asBuf(params[5]);
    u.identity_private_key_nonce = asBuf(params[6]);
    u.exchange_public_key = asBuf(params[7]);
    u.exchange_private_key_wrapped = asBuf(params[8]);
    u.exchange_private_key_nonce = asBuf(params[9]);
    return { rows: [], rowCount: 1 };
  }

  // /recovery/finalize: re-wrap de la vault key (solo del owner).
  if (sql.startsWith('UPDATE vaults SET vault_key_wrapped = $1, vault_key_nonce = $2')) {
    const v = store.vaults.find((x) => x.id === params[2] && x.owner_id === params[3]);
    if (!v) return { rows: [], rowCount: 0 };
    v.vault_key_wrapped = asBuf(params[0]);
    v.vault_key_nonce = asBuf(params[1]);
    return { rows: [], rowCount: 1 };
  }

  // /recovery/status (usuario autenticado).
  if (sql.startsWith('SELECT recovery_enabled, recovery_public_key, recovery_box_public_key')) {
    const u = store.users.get(params[0]);
    if (!u) return { rows: [], rowCount: 0 };
    return {
      rows: [{
        recovery_enabled: u.recovery_enabled,
        recovery_public_key: u.recovery_public_key,
        recovery_box_public_key: u.recovery_box_public_key,
        exchange_private_key_sealed_recovery: u.exchange_private_key_sealed_recovery,
      }],
      rowCount: 1,
    };
  }

  if (sql.includes('count(vault_key_sealed_recovery)::int AS sealed')) {
    const mine = store.vaults.filter((v) => v.owner_id === params[0]);
    return {
      rows: [{ total: mine.length, sealed: mine.filter((v) => v.vault_key_sealed_recovery !== null).length }],
      rowCount: 1,
    };
  }

  // /recovery/upgrade: sube (o rota) el kit.
  if (sql.startsWith('UPDATE users SET recovery_public_key = COALESCE($1')) {
    const u = store.users.get(params[3]);
    if (!u) return { rows: [], rowCount: 0 };
    if (params[0] !== null) u.recovery_public_key = asBuf(params[0]);
    u.recovery_enabled = true;
    u.recovery_box_public_key = asBuf(params[1]);
    u.exchange_private_key_sealed_recovery = asBuf(params[2]);
    return { rows: [], rowCount: 1 };
  }

  if (sql.startsWith('UPDATE vaults SET vault_key_sealed_recovery = $1')) {
    const v = store.vaults.find((x) => x.id === params[1] && x.owner_id === params[2]);
    if (!v) return { rows: [], rowCount: 0 };
    v.vault_key_sealed_recovery = asBuf(params[0]);
    return { rows: [], rowCount: 1 };
  }

  // ─── users ────────────────────────────────────────────────
  if (sql.includes('SELECT username FROM users WHERE id = $1')) {
    const u = store.users.get(params[0]);
    return u ? { rows: [{ username: u.username }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }

  if (sql.includes('SELECT id FROM users WHERE email_hash = $1')) {
    const eh = asBuf(params[0]);
    const u = [...store.users.values()].find((x) => x.email_hash.equals(eh));
    return u ? { rows: [{ id: u.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }

  if (sql.includes('SELECT identity_public_key FROM users WHERE id = $1')) {
    const u = store.users.get(params[0]);
    return u ? { rows: [{ identity_public_key: u.identity_public_key }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }

  // ─── agent_pairing_tokens ─────────────────────────────────
  if (sql.startsWith('INSERT INTO agent_pairing_tokens')) {
    store.pairingTokens.push({
      id: randomUUID(),
      user_id: params[0],
      code_hash: asBuf(params[1]),
      name_encrypted: asBuf(params[2]),
      name_nonce: asBuf(params[3]),
      expires_at: params[4] as Date,
      used_at: null,
      created_at: store.nextSeq(),
    });
    return { rows: [], rowCount: 1 };
  }

  if (sql.includes('FROM agent_pairing_tokens') && sql.includes('code_hash = $1')) {
    const hash = asBuf(params[0]);
    const now = Date.now();
    const tok = store.pairingTokens
      .filter((t) => t.code_hash.equals(hash) && t.used_at === null && t.expires_at.getTime() > now)
      .sort((a, b) => b.created_at - a.created_at)[0];
    if (!tok) return { rows: [], rowCount: 0 };
    return {
      rows: [{ id: tok.id, user_id: tok.user_id, name_encrypted: tok.name_encrypted, name_nonce: tok.name_nonce }],
      rowCount: 1,
    };
  }

  if (sql.startsWith('UPDATE agent_pairing_tokens SET used_at')) {
    const tok = store.pairingTokens.find((t) => t.id === params[0]);
    if (tok) tok.used_at = new Date();
    return { rows: [], rowCount: tok ? 1 : 0 };
  }

  // ─── agents ───────────────────────────────────────────────
  if (sql.startsWith('INSERT INTO agents')) {
    const id = randomUUID();
    store.agents.push({
      id,
      user_id: params[0],
      agent_public_key: asBuf(params[1]),
      name_encrypted: asBuf(params[2]),
      name_nonce: asBuf(params[3]),
      platform: params[4] ?? null,
      last_seen_at: new Date(),
      created_at: store.nextSeq(),
      revoked_at: null,
    });
    return { rows: [{ id }], rowCount: 1 };
  }

  // Listado de agentes del usuario.
  if (sql.includes('FROM agents') && sql.includes('user_id = $1') && sql.includes('ORDER BY created_at')) {
    const rows = store.agents
      .filter((a) => a.user_id === params[0] && a.revoked_at === null)
      .sort((a, b) => a.created_at - b.created_at)
      .map((a) => ({
        id: a.id,
        name_encrypted: a.name_encrypted,
        name_nonce: a.name_nonce,
        platform: a.platform,
        last_seen_at: a.last_seen_at,
        created_at: new Date(),
      }));
    return { rows, rowCount: rows.length };
  }

  // Comprobación de propiedad del agente (ownership + no revocado).
  if (sql.startsWith('SELECT id FROM agents') && sql.includes('user_id = $2')) {
    const a = store.agents.find((x) => x.id === params[0] && x.user_id === params[1] && x.revoked_at === null);
    return a ? { rows: [{ id: a.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }

  // Carga de clave pública para el challenge del WS.
  if (sql.includes('SELECT user_id, agent_public_key FROM agents WHERE id = $1')) {
    const a = store.agents.find((x) => x.id === params[0] && x.revoked_at === null);
    return a
      ? { rows: [{ user_id: a.user_id, agent_public_key: a.agent_public_key }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  }

  // Revocar agente.
  if (sql.startsWith('UPDATE agents SET revoked_at')) {
    const a = store.agents.find((x) => x.id === params[0] && x.user_id === params[1] && x.revoked_at === null);
    if (a) a.revoked_at = new Date();
    return { rows: a ? [{ id: a.id }] : [], rowCount: a ? 1 : 0 };
  }

  if (sql.startsWith('UPDATE agents SET last_seen_at')) {
    const a = store.agents.find((x) => x.id === params[0]);
    if (a) a.last_seen_at = new Date();
    return { rows: [], rowCount: a ? 1 : 0 };
  }

  // ─── storage_volumes ──────────────────────────────────────
  // Busca un volumen por (agent_id, path) — idempotencia de use/format.
  if (sql.startsWith('SELECT id FROM storage_volumes') && sql.includes('agent_id = $1') && sql.includes('path = $2')) {
    const v = store.volumes.find((x) => x.agent_id === params[0] && x.path === params[1]);
    return v ? { rows: [{ id: v.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }

  if (sql.startsWith('UPDATE storage_volumes SET active = true, label')) {
    const v = store.volumes.find((x) => x.id === params[0]);
    if (v) { v.active = true; v.label = params[1]; v.total_bytes = Number(params[2] ?? 0); }
    return { rows: [], rowCount: v ? 1 : 0 };
  }

  if (sql.startsWith('INSERT INTO storage_volumes')) {
    const id = randomUUID();
    store.volumes.push({
      id, path: params[0], label: params[1], agent_id: params[2], user_id: params[3],
      active: true, total_bytes: Number(params[4] ?? 0),
    });
    return { rows: [{ id }], rowCount: 1 };
  }

  // ─── chunks (solo lo que consultan las rutas de disco) ────
  // Guarda de "¿este volumen ya tiene archivos?" antes de formatear/dar de baja.
  if (sql.startsWith('SELECT 1 FROM chunks WHERE volume_id')) {
    const has = store.chunks.some((c) => c.volume_id === params[0]);
    return has ? { rows: [{ '?column?': 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }

  throw new Error(`fake-db: consulta no contemplada → ${sql}`);
}

export const db = { query };

// tx(): las rutas la usan para agrupar updates; aquí no hay transacciones
// reales — el "client" es el mismo query del fake. Si el callback lanza,
// el estado mutado NO se revierte (suficiente para los asserts de error,
// que comprueban el código HTTP, no el rollback).
export const tx = async <T>(fn: (client: { query: typeof query }) => Promise<T>): Promise<T> =>
  fn({ query });

// ─── Helpers de seeding para los tests ──────────────────────
export function resetDb(): void {
  store.reset();
}

export function seedUser(u: Partial<FakeUser> & { id: string }): FakeUser {
  const user: FakeUser = {
    id: u.id,
    username: u.username ?? 'tester',
    email_hash: u.email_hash ?? Buffer.alloc(32),
    identity_public_key: u.identity_public_key ?? null,
    two_factor_email_enabled: u.two_factor_email_enabled ?? false,
    email_verified: u.email_verified ?? false,
    recovery_enabled: u.recovery_enabled ?? false,
    recovery_public_key: u.recovery_public_key ?? null,
    recovery_box_public_key: u.recovery_box_public_key ?? null,
    recovery_kdf_salt: u.recovery_kdf_salt ?? null,
    exchange_public_key: u.exchange_public_key ?? null,
    exchange_private_key_sealed_recovery: u.exchange_private_key_sealed_recovery ?? null,
    opaque_record: u.opaque_record ?? null,
    kdf_salt: u.kdf_salt ?? null,
    kdf_ops_limit: u.kdf_ops_limit ?? null,
    kdf_mem_limit: u.kdf_mem_limit ?? null,
    identity_private_key_wrapped: u.identity_private_key_wrapped ?? null,
    identity_private_key_nonce: u.identity_private_key_nonce ?? null,
    exchange_private_key_wrapped: u.exchange_private_key_wrapped ?? null,
    exchange_private_key_nonce: u.exchange_private_key_nonce ?? null,
  };
  store.users.set(user.id, user);
  return user;
}

export function seedVault(v: Partial<FakeVault> & { id: string; owner_id: string }): FakeVault {
  const vault: FakeVault = {
    id: v.id,
    owner_id: v.owner_id,
    vault_key_wrapped: v.vault_key_wrapped ?? Buffer.alloc(48),
    vault_key_nonce: v.vault_key_nonce ?? Buffer.alloc(24),
    vault_key_sealed_recovery: v.vault_key_sealed_recovery ?? null,
  };
  store.vaults.push(vault);
  return vault;
}
