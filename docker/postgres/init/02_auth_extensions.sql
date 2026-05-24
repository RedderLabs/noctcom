-- ═══════════════════════════════════════════════════════════════
-- Noctcom — Migración 02: 2FA, iconos de carpetas, recuperación
-- ═══════════════════════════════════════════════════════════════

-- ─── TOTP secrets ───────────────────────────────────────────────
-- El secret TOTP se cifra con la MK del usuario en el cliente.
-- El servidor verifica el código aceptando un proof: el cliente envía
-- el código TOTP en claro durante login (es OTP de 6 dígitos efímero).
-- Para verificar, el servidor necesita el secret → lo guardamos
-- cifrado bajo una clave derivada de la MK (zero-knowledge mantenido
-- para el resto, pero el secret TOTP sí debe poder verificarse server-side
-- — alternativa: enviar HMAC del código + timestamp y verificar offline,
-- pero el estándar más práctico es cifrar el secret con una server-side
-- wrap key que solo se desencripta al momento de la verificación).
--
-- Aquí adoptamos un compromiso pragmático: el TOTP_secret se cifra
-- con una clave derivada de un "auth_secret" que el cliente envía
-- durante login (HKDF(MK, "noctcom.totp.v1")). Así el servidor solo
-- puede descifrar el TOTP cuando el cliente prueba conocer la MK.
-- ───────────────────────────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN totp_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN totp_secret_wrapped BYTEA,
    ADD COLUMN totp_secret_nonce   BYTEA,
    ADD COLUMN totp_backup_codes_wrapped BYTEA,  -- 10 códigos de recovery cifrados
    ADD COLUMN totp_backup_codes_nonce   BYTEA,
    ADD COLUMN totp_verified_at    TIMESTAMPTZ,

    -- Recovery: el usuario sube los wrapped recovery-only keys.
    -- Si pierde la contraseña, usa la frase de recuperación → deriva
    -- una recovery key → desempaqueta sus privkeys → puede generar nueva MK.
    ADD COLUMN recovery_kdf_salt   BYTEA,
    ADD COLUMN recovery_enabled    BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── WebAuthn / Passkeys ────────────────────────────────────────
CREATE TABLE webauthn_credentials (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id        BYTEA UNIQUE NOT NULL,         -- raw credential id de WebAuthn
    public_key           BYTEA NOT NULL,                -- COSE public key
    counter              BIGINT NOT NULL DEFAULT 0,
    transports           TEXT[],
    device_type          TEXT,                          -- 'platform' | 'cross-platform'
    backed_up            BOOLEAN NOT NULL DEFAULT FALSE,
    nickname             TEXT,                          -- "MacBook Touch ID"
    last_used_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at           TIMESTAMPTZ
);
CREATE INDEX webauthn_user_idx ON webauthn_credentials(user_id) WHERE revoked_at IS NULL;

-- ─── WebAuthn challenges (en Redis en prod; aquí fallback DB) ────
CREATE TABLE webauthn_challenges (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID REFERENCES users(id) ON DELETE CASCADE,
    challenge            BYTEA NOT NULL,
    purpose              TEXT NOT NULL,                 -- 'registration' | 'authentication'
    expires_at           TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webauthn_challenges_expires_idx ON webauthn_challenges(expires_at);

-- ─── Email verification tokens (para recuperación de cuenta) ─────
-- El email cifrado se guarda wrapped con MK; el servidor solo tiene el hash.
-- Para enviar emails de recuperación: el usuario configura un email_recovery
-- adicional que el servidor SÍ puede leer (consciente trade-off opcional).
-- Por defecto, recuperación = frase mnemónica de 12 palabras (zero-knowledge puro).
-- ───────────────────────────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN recovery_email_encrypted BYTEA,         -- cifrado con clave server-side opcional
    ADD COLUMN recovery_email_hash      BYTEA;         -- hash para enviar el email

CREATE TABLE password_reset_tokens (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash           BYTEA UNIQUE NOT NULL,
    expires_at           TIMESTAMPTZ NOT NULL,
    used_at              TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    requester_ip_hash    BYTEA
);
CREATE INDEX password_reset_user_idx ON password_reset_tokens(user_id) WHERE used_at IS NULL;

-- ─── Iconos de carpetas (cifrados, igual que metadata) ──────────
-- En lugar de columna nueva, vamos a guardar el icono dentro del JSON
-- de metadata_encrypted del nodo. Pero añadimos una columna PUBLIC
-- para una "categoría visual" no sensible: color del icono (1 byte).
-- Esto permite renderizar la cuadrícula sin descifrar todo.
--
-- DECISIÓN: NO añadimos color público — incluso el color del icono
-- puede ser información. Lo metemos también en metadata_encrypted.
-- El frontend lo desencripta para renderizar. Cero leakage.
-- ───────────────────────────────────────────────────────────────

-- ─── Full-text search (cliente-side, índice en metadata cifrada) ─
-- El servidor NO puede indexar nombres en claro. Solución:
-- el cliente mantiene un índice local (IndexedDB) construido al
-- desencriptar la lista. Para paginación, server pagina por
-- (vault_id, parent_id, created_at) — ya tenemos índice.
-- ───────────────────────────────────────────────────────────────
CREATE INDEX nodes_pagination_idx
    ON nodes (vault_id, parent_id, created_at DESC, id)
    WHERE deleted_at IS NULL;

-- ─── Login rate limiting / lockout ──────────────────────────────
CREATE TABLE login_attempts (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_hash           BYTEA NOT NULL,
    ip_hash              BYTEA,
    success              BOOLEAN NOT NULL,
    failure_reason       TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON login_attempts(email_hash, created_at DESC);
CREATE INDEX login_attempts_ip_idx ON login_attempts(ip_hash, created_at DESC);
