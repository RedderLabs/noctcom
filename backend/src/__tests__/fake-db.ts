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
  private seq = 0;

  reset(): void {
    this.users.clear();
    this.challenges = [];
    this.credentials = [];
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
    const purpose = /'(registration|authentication|step-up)'/.exec(sql)?.[1] ?? 'unknown';
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

  // step-up/finish: consume el challenge exacto.
  if (sql.startsWith('DELETE FROM webauthn_challenges') && sql.includes("purpose = 'step-up'") && sql.includes('challenge = $2')) {
    const [userId, challenge] = params;
    const buf = asBuf(challenge);
    const now = Date.now();
    const target = store.challenges.find(
      (c) => c.user_id === userId && c.purpose === 'step-up' && c.challenge.equals(buf) && c.expires_at.getTime() > now,
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

  throw new Error(`fake-db: consulta no contemplada → ${sql}`);
}

export const db = { query };

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
  };
  store.users.set(user.id, user);
  return user;
}
