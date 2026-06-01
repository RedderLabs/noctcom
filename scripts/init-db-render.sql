-- ═══════════════════════════════════════════════════════════════
-- Noctcom — Schema completo para producción (Render PostgreSQL)
-- Ejecutar UNA sola vez:
--   psql $DATABASE_URL -f scripts/init-db-render.sql
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username             TEXT UNIQUE NOT NULL CHECK (length(username) BETWEEN 3 AND 64),
    email_hash           BYTEA UNIQUE NOT NULL,
    kdf_salt             BYTEA NOT NULL,
    kdf_ops_limit        INTEGER NOT NULL DEFAULT 3,
    kdf_mem_limit        INTEGER NOT NULL DEFAULT 67108864,
    kdf_algorithm        TEXT   NOT NULL DEFAULT 'argon2id',
    opaque_record        BYTEA NOT NULL,
    identity_public_key  BYTEA NOT NULL,
    identity_private_key_wrapped  BYTEA NOT NULL,
    identity_private_key_nonce    BYTEA NOT NULL,
    exchange_public_key  BYTEA NOT NULL,
    exchange_private_key_wrapped  BYTEA NOT NULL,
    exchange_private_key_nonce    BYTEA NOT NULL,
    recovery_private_keys_wrapped BYTEA,
    recovery_private_keys_nonce   BYTEA,
    recovery_public_key  BYTEA,
    recovery_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    recovery_kdf_salt    BYTEA,
    recovery_email_encrypted BYTEA,
    recovery_email_hash  BYTEA,
    is_admin             BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified       BOOLEAN NOT NULL DEFAULT FALSE,
    verification_code_hash BYTEA,
    verification_code_expires TIMESTAMPTZ,
    totp_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    totp_secret_wrapped  BYTEA,
    totp_secret_nonce    BYTEA,
    totp_backup_codes_wrapped BYTEA,
    totp_backup_codes_nonce   BYTEA,
    totp_verified_at     TIMESTAMPTZ,
    storage_quota_bytes  BIGINT NOT NULL DEFAULT 2147483648,
    storage_used_bytes   BIGINT NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS users_email_hash_idx ON users(email_hash);

-- ─── DEVICES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name_encrypted BYTEA NOT NULL,
    device_name_nonce     BYTEA NOT NULL,
    device_public_key    BYTEA NOT NULL,
    last_seen_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id) WHERE revoked_at IS NULL;

-- ─── VAULTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaults (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name_encrypted       BYTEA NOT NULL,
    name_nonce           BYTEA NOT NULL,
    vault_key_wrapped    BYTEA NOT NULL,
    vault_key_nonce      BYTEA NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vaults_owner_idx ON vaults(owner_id);

-- ─── NODES ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE node_kind AS ENUM ('folder', 'file'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS nodes (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id             UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    parent_id            UUID REFERENCES nodes(id) ON DELETE CASCADE,
    kind                 node_kind NOT NULL,
    name_encrypted       BYTEA NOT NULL,
    name_nonce           BYTEA NOT NULL,
    metadata_encrypted   BYTEA,
    metadata_nonce       BYTEA,
    file_key_wrapped     BYTEA,
    file_key_nonce       BYTEA,
    current_version_id   UUID,
    ciphertext_size      BIGINT NOT NULL DEFAULT 0,
    starred              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS nodes_vault_parent_idx ON nodes(vault_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS nodes_vault_deleted_idx ON nodes(vault_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS nodes_pagination_idx ON nodes(vault_id, parent_id, created_at DESC, id) WHERE deleted_at IS NULL;

-- ─── FILE VERSIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_versions (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id              UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    version_number       INTEGER NOT NULL,
    metadata_encrypted   BYTEA,
    metadata_nonce       BYTEA,
    total_size           BIGINT NOT NULL,
    chunk_count          INTEGER NOT NULL,
    content_hash         BYTEA NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_device    UUID REFERENCES devices(id),
    UNIQUE (node_id, version_number)
);
CREATE INDEX IF NOT EXISTS file_versions_node_idx ON file_versions(node_id, version_number DESC);

-- Postgres no soporta IF NOT EXISTS en ADD CONSTRAINT; lo hacemos idempotente
-- con un bloque DO que ignora el duplicado.
DO $$ BEGIN
    ALTER TABLE nodes ADD CONSTRAINT nodes_current_version_fk
        FOREIGN KEY (current_version_id) REFERENCES file_versions(id) DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── STORAGE VOLUMES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage_volumes (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    path       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── CHUNKS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chunks (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id           UUID NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
    chunk_index          INTEGER NOT NULL,
    s3_key               TEXT   NOT NULL,
    ciphertext_size      BIGINT NOT NULL,
    chunk_nonce          BYTEA NOT NULL,
    chunk_auth_tag       BYTEA NOT NULL,
    storage_type         TEXT   NOT NULL DEFAULT 's3',
    volume_id            UUID   REFERENCES storage_volumes(id),
    UNIQUE (version_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS chunks_version_idx ON chunks(version_id, chunk_index);
CREATE INDEX IF NOT EXISTS chunks_s3_idx ON chunks(s3_key);

-- ─── SHARES ────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE share_permission AS ENUM ('read', 'write'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS shares (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id              UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    shared_by            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission           share_permission NOT NULL DEFAULT 'read',
    sealed_key           BYTEA NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ,
    revoked_at           TIMESTAMPTZ,
    UNIQUE (node_id, shared_with)
);
CREATE INDEX IF NOT EXISTS shares_with_idx ON shares(shared_with) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS shares_by_idx ON shares(shared_by) WHERE revoked_at IS NULL;

-- ─── PUBLIC LINKS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public_links (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id              UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    created_by           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token                TEXT UNIQUE NOT NULL,
    password_verifier_hash BYTEA NOT NULL,
    password_kdf_salt      BYTEA NOT NULL,
    sealed_key           BYTEA NOT NULL,
    sealed_key_nonce     BYTEA NOT NULL,
    download_limit       INTEGER,
    download_count       INTEGER NOT NULL DEFAULT 0,
    expires_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS public_links_token_idx ON public_links(token) WHERE revoked_at IS NULL;

-- ─── SESSIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id            UUID REFERENCES devices(id) ON DELETE CASCADE,
    refresh_token_hash   BYTEA UNIQUE NOT NULL,
    ip_address_hash      BYTEA,
    user_agent_hash      BYTEA,
    expires_at           TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at) WHERE revoked_at IS NULL;

-- ─── AUDIT LOG ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_encrypted      BYTEA NOT NULL,
    event_nonce          BYTEA NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log(user_id, created_at DESC);

-- ─── DISK FORMAT LOG ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disk_format_log (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id),
    device     TEXT NOT NULL,
    filesystem TEXT NOT NULL,
    label      TEXT NOT NULL,
    mount_path TEXT NOT NULL,
    status     TEXT NOT NULL,
    error      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disk_format_log_user_idx ON disk_format_log(user_id, created_at DESC);

-- ─── WEBAUTHN ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id        BYTEA UNIQUE NOT NULL,
    public_key           BYTEA NOT NULL,
    counter              BIGINT NOT NULL DEFAULT 0,
    transports           TEXT[],
    device_type          TEXT,
    backed_up            BOOLEAN NOT NULL DEFAULT FALSE,
    nickname             TEXT,
    last_used_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS webauthn_user_idx ON webauthn_credentials(user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID REFERENCES users(id) ON DELETE CASCADE,
    challenge            BYTEA NOT NULL,
    purpose              TEXT NOT NULL,
    expires_at           TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_idx ON webauthn_challenges(expires_at);

-- ─── LOGIN ATTEMPTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_hash           BYTEA NOT NULL,
    ip_hash              BYTEA,
    success              BOOLEAN NOT NULL,
    failure_reason       TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts(email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts(ip_hash, created_at DESC);

-- ─── PASSWORD RESET ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash           BYTEA UNIQUE NOT NULL,
    expires_at           TIMESTAMPTZ NOT NULL,
    used_at              TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    requester_ip_hash    BYTEA
);
CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_tokens(user_id) WHERE used_at IS NULL;

-- ─── PUSH TOKENS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, token)
);

-- ─── TRIGGERS ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS nodes_updated_at ON nodes;
CREATE TRIGGER nodes_updated_at BEFORE UPDATE ON nodes FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
