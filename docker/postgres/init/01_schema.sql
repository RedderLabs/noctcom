-- ═══════════════════════════════════════════════════════════════
-- CryptVault — Schema zero-knowledge
-- Todos los campos marcados ENCRYPTED contienen ciphertext + nonce
-- generados en el cliente. El servidor NO puede descifrarlos.
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ───────────────────────────────────────────────────────────────
-- USERS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE users (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username             TEXT UNIQUE NOT NULL CHECK (length(username) BETWEEN 3 AND 64),
    email_hash           BYTEA UNIQUE NOT NULL,         -- BLAKE2b(email) para login/lookup sin guardar el email en claro

    -- Argon2id parameters (verificación cliente-side, solo metadatos)
    kdf_salt             BYTEA NOT NULL,                -- 16 bytes random
    kdf_ops_limit        INTEGER NOT NULL DEFAULT 3,    -- argon2id ops
    kdf_mem_limit        INTEGER NOT NULL DEFAULT 67108864, -- 64 MiB
    kdf_algorithm        TEXT   NOT NULL DEFAULT 'argon2id',

    -- OPAQUE-style verifier (el servidor NUNCA tiene la contraseña ni puede crackearla offline)
    opaque_record        BYTEA NOT NULL,                -- envelope OPAQUE

    -- Claves asimétricas del usuario (las privadas vienen wrapped por la MK derivada de la contraseña)
    identity_public_key  BYTEA NOT NULL,                -- Ed25519 pubkey para firmas
    identity_private_key_wrapped  BYTEA NOT NULL,       -- ENCRYPTED con MK
    identity_private_key_nonce    BYTEA NOT NULL,

    exchange_public_key  BYTEA NOT NULL,                -- X25519 pubkey para sealed envelopes
    exchange_private_key_wrapped  BYTEA NOT NULL,       -- ENCRYPTED con MK
    exchange_private_key_nonce    BYTEA NOT NULL,

    -- Recovery: frase de 12 palabras → MK alternativa que también wrappea las privadas
    recovery_private_keys_wrapped BYTEA,                -- opcional, set en signup
    recovery_private_keys_nonce   BYTEA,

    -- Cuota
    storage_quota_bytes  BIGINT NOT NULL DEFAULT 10737418240,
    storage_used_bytes   BIGINT NOT NULL DEFAULT 0,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at        TIMESTAMPTZ
);

CREATE INDEX users_email_hash_idx ON users(email_hash);

-- ───────────────────────────────────────────────────────────────
-- DEVICES — múltiples dispositivos por usuario, cada uno con su par X25519
-- (permite revocar acceso por dispositivo sin rotar todas las claves)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE devices (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name_encrypted BYTEA NOT NULL,               -- ENCRYPTED nombre humano
    device_name_nonce     BYTEA NOT NULL,
    device_public_key    BYTEA NOT NULL,                -- X25519 pubkey del dispositivo
    last_seen_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at           TIMESTAMPTZ
);
CREATE INDEX devices_user_idx ON devices(user_id) WHERE revoked_at IS NULL;

-- ───────────────────────────────────────────────────────────────
-- VAULTS — un usuario puede tener múltiples "bóvedas" (raíces)
-- cada vault tiene su propia clave maestra wrapped
-- ───────────────────────────────────────────────────────────────
CREATE TABLE vaults (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name_encrypted       BYTEA NOT NULL,                -- ENCRYPTED nombre del vault
    name_nonce           BYTEA NOT NULL,
    vault_key_wrapped    BYTEA NOT NULL,                -- ENCRYPTED con la exchange_private_key del owner
    vault_key_nonce      BYTEA NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vaults_owner_idx ON vaults(owner_id);

-- ───────────────────────────────────────────────────────────────
-- NODES — árbol unificado de archivos y carpetas (estilo POSIX)
-- ───────────────────────────────────────────────────────────────
CREATE TYPE node_kind AS ENUM ('folder', 'file');

CREATE TABLE nodes (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id             UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    parent_id            UUID REFERENCES nodes(id) ON DELETE CASCADE,
    kind                 node_kind NOT NULL,

    -- Nombre cifrado con la vault_key
    name_encrypted       BYTEA NOT NULL,
    name_nonce           BYTEA NOT NULL,

    -- Metadatos cifrados (size original, mime, mtime, tags...)
    metadata_encrypted   BYTEA,
    metadata_nonce       BYTEA,

    -- Cada archivo tiene su propia file_key (rotación granular). La file_key viene
    -- wrapped con la vault_key.
    file_key_wrapped     BYTEA,                         -- NULL para folders
    file_key_nonce       BYTEA,

    -- Versión actual (apunta a file_versions). NULL si es folder o aún no subido.
    current_version_id   UUID,

    -- Tamaño del ciphertext (para cuota). El size real va en metadata_encrypted.
    ciphertext_size      BIGINT NOT NULL DEFAULT 0,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ                    -- soft delete para papelera
);
CREATE INDEX nodes_vault_parent_idx ON nodes(vault_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX nodes_vault_deleted_idx ON nodes(vault_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- ───────────────────────────────────────────────────────────────
-- FILE_VERSIONS — versionado: cada save genera una versión nueva
-- ───────────────────────────────────────────────────────────────
CREATE TABLE file_versions (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id              UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    version_number       INTEGER NOT NULL,
    metadata_encrypted   BYTEA,
    metadata_nonce       BYTEA,
    total_size           BIGINT NOT NULL,               -- suma de ciphertext_size de chunks
    chunk_count          INTEGER NOT NULL,
    content_hash         BYTEA NOT NULL,                -- BLAKE2b sobre ciphertext concat (dedup posible sin leak)
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_device    UUID REFERENCES devices(id),
    UNIQUE (node_id, version_number)
);
CREATE INDEX file_versions_node_idx ON file_versions(node_id, version_number DESC);

ALTER TABLE nodes
    ADD CONSTRAINT nodes_current_version_fk
    FOREIGN KEY (current_version_id) REFERENCES file_versions(id)
    DEFERRABLE INITIALLY DEFERRED;

-- ───────────────────────────────────────────────────────────────
-- CHUNKS — archivos se trocean en chunks de ~4 MiB cifrados
-- Cada chunk vive en MinIO bajo s3_key. El servidor NO puede leerlos.
-- ───────────────────────────────────────────────────────────────
-- STORAGE VOLUMES — discos físicos configurados para almacenamiento
-- ───────────────────────────────────────────────────────────────
CREATE TABLE storage_volumes (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    path       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
CREATE TABLE chunks (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id           UUID NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
    chunk_index          INTEGER NOT NULL,
    s3_key               TEXT   NOT NULL,               -- random opaque key en MinIO o disco
    ciphertext_size      BIGINT NOT NULL,
    chunk_nonce          BYTEA NOT NULL,                -- nonce XChaCha20-Poly1305
    chunk_auth_tag       BYTEA NOT NULL,                -- tag Poly1305
    storage_type         TEXT   NOT NULL DEFAULT 's3',  -- 's3' | 'disk'
    volume_id            UUID   REFERENCES storage_volumes(id),
    UNIQUE (version_id, chunk_index)
);
CREATE INDEX chunks_version_idx ON chunks(version_id, chunk_index);
CREATE INDEX chunks_s3_idx ON chunks(s3_key);

-- ───────────────────────────────────────────────────────────────
-- SHARES — compartir nodos con otros usuarios (E2E real)
-- La file_key/vault_key se re-cifra para el destinatario con su
-- exchange_public_key (sealed box). El server enruta pero no lee.
-- ───────────────────────────────────────────────────────────────
CREATE TYPE share_permission AS ENUM ('read', 'write');

CREATE TABLE shares (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id              UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    shared_by            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission           share_permission NOT NULL DEFAULT 'read',

    -- La clave del nodo viene sellada con la pubkey del destinatario
    -- (libsodium crypto_box_seal). Solo el dueño de la privkey la abre.
    sealed_key           BYTEA NOT NULL,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ,
    revoked_at           TIMESTAMPTZ,
    UNIQUE (node_id, shared_with)
);
CREATE INDEX shares_with_idx ON shares(shared_with) WHERE revoked_at IS NULL;
CREATE INDEX shares_by_idx ON shares(shared_by) WHERE revoked_at IS NULL;

-- ───────────────────────────────────────────────────────────────
-- PUBLIC_LINKS — enlaces "públicos" con password (zero-knowledge)
-- El servidor solo guarda un BLAKE2b(password+salt). La clave del
-- archivo está wrapped con un secreto derivado del password
-- (no del hash) — el server no puede descifrar aunque crackee el hash.
-- ───────────────────────────────────────────────────────────────
CREATE TABLE public_links (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id              UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    created_by           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token                TEXT UNIQUE NOT NULL,          -- slug aleatorio (32 bytes b64url)

    -- Verificador del password (solo para rate limiting, no para descifrar)
    password_verifier_hash BYTEA NOT NULL,
    password_kdf_salt      BYTEA NOT NULL,

    -- file_key wrapped con clave derivada del password real
    sealed_key           BYTEA NOT NULL,
    sealed_key_nonce     BYTEA NOT NULL,

    download_limit       INTEGER,
    download_count       INTEGER NOT NULL DEFAULT 0,
    expires_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at           TIMESTAMPTZ
);
CREATE INDEX public_links_token_idx ON public_links(token) WHERE revoked_at IS NULL;

-- ───────────────────────────────────────────────────────────────
-- SESSIONS — JWT refresh tokens, vinculados a device
-- ───────────────────────────────────────────────────────────────
CREATE TABLE sessions (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id            UUID REFERENCES devices(id) ON DELETE CASCADE,
    refresh_token_hash   BYTEA UNIQUE NOT NULL,
    ip_address_hash      BYTEA,                         -- BLAKE2b(ip) — para auditoría sin guardar la IP
    user_agent_hash      BYTEA,
    expires_at           TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at           TIMESTAMPTZ
);
CREATE INDEX sessions_user_idx ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expires_idx ON sessions(expires_at) WHERE revoked_at IS NULL;

-- ───────────────────────────────────────────────────────────────
-- AUDIT_LOG — cifrado por el cliente con la MK (server no puede leer)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_encrypted      BYTEA NOT NULL,
    event_nonce          BYTEA NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_user_idx ON audit_log(user_id, created_at DESC);

-- ───────────────────────────────────────────────────────────────
-- Trigger genérico para updated_at
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER nodes_updated_at
    BEFORE UPDATE ON nodes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
