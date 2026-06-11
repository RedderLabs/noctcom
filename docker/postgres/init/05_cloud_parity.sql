-- ═══════════════════════════════════════════════════════════════
-- Noctcom — Migración 05: paridad con la nube
--
-- El init del self-host (este directorio) había quedado desincronizado
-- del de la nube (scripts/init-db.sql), que aplica una tanda de ALTER
-- que aquí nunca llegaron. Resultado: el signup creaba el usuario y
-- luego reventaba al escribir una columna inexistente (verification_code_hash,
-- billing…), dejando cuentas a medias (409 «ya registrado» en el reintento).
--
-- Este fichero replica EXACTAMENTE la cola de scripts/init-db.sql. Todo es
-- idempotente (IF NOT EXISTS), así que es seguro re-aplicarlo sobre una BD
-- existente y no choca con lo que ya crean 02/03/04.
-- ═══════════════════════════════════════════════════════════════

-- ─── Verificación de email ─────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_hash BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires TIMESTAMPTZ;

-- ─── Recovery (v1 + v2) — redundante con 04, idempotente ───────
ALTER TABLE users  ADD COLUMN IF NOT EXISTS recovery_public_key BYTEA;
ALTER TABLE users  ADD COLUMN IF NOT EXISTS recovery_box_public_key BYTEA;
ALTER TABLE users  ADD COLUMN IF NOT EXISTS exchange_private_key_sealed_recovery BYTEA;
ALTER TABLE vaults ADD COLUMN IF NOT EXISTS vault_key_sealed_recovery BYTEA;

-- ─── Billing (Fase 8) ──────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS subscription_status TEXT,
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users(stripe_customer_id);
CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Favoritos ─────────────────────────────────────────────────
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Tokens de push ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, token)
);
