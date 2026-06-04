-- ═══════════════════════════════════════════════════════════════
-- Noctcom — Script completo de inicialización de base de datos
-- Ejecutar una sola vez contra la BD de producción:
--   psql $DATABASE_URL -f scripts/init-db.sql
-- ═══════════════════════════════════════════════════════════════

-- ─── 01_schema.sql ─────────────────────────────────────────────
\i docker/postgres/init/01_schema.sql

-- ─── 02_auth_extensions.sql ────────────────────────────────────
\i docker/postgres/init/02_auth_extensions.sql

-- ─── 02_admin_format.sql ───────────────────────────────────────
\i docker/postgres/init/02_admin_format.sql

-- ─── Email verification columns ────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_hash BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires TIMESTAMPTZ;

-- ─── Recovery public key ───────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_public_key BYTEA;

-- ─── Recovery v2 (04_recovery_v2.sql) ──────────────────────────
ALTER TABLE users  ADD COLUMN IF NOT EXISTS recovery_box_public_key BYTEA;
ALTER TABLE users  ADD COLUMN IF NOT EXISTS exchange_private_key_sealed_recovery BYTEA;
ALTER TABLE vaults ADD COLUMN IF NOT EXISTS vault_key_sealed_recovery BYTEA;

-- ─── Starred nodes ─────────────────────────────────────────────
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Push notification tokens ──────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, token)
);
