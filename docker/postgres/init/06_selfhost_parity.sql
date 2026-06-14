-- ═══════════════════════════════════════════════════════════════
-- Noctcom — Migración 06: paridad self-host con la nube (parte 2)
--
-- 05_cloud_parity.sql portó la cola "vieja" de scripts/init-db.sql, pero el
-- esquema de la nube (scripts/init-db-render.sql) siguió creciendo y estas
-- columnas/tablas nunca llegaron al init del self-host. Sin ellas, una BD
-- recién creada devuelve 500 en:
--   · GET /api/v1/auth/me        (users.onboarded_at / trial_started_at / trial_exempt)
--   · GET /api/v1/storage/volumes (storage_volumes.user_id)
--   · GET /api/v1/storage/summary (SUM(storage_volumes.total_bytes) WHERE user_id)
--
-- Replica EXACTAMENTE lo que falta de scripts/init-db-render.sql. Todo es
-- idempotente (IF NOT EXISTS), así que es seguro re-aplicarlo sobre una BD en
-- marcha vía scripts/selfhost-db-sync.sh sin reinstalar ni perder datos.
-- ═══════════════════════════════════════════════════════════════

-- ─── users: onboarding + periodo de prueba ─────────────────────
-- onboarded_at/trial: las cuentas YA existentes se marcan como onboarded/exentas
-- (DEFAULT al añadir la columna) y acto seguido se quita el default para que los
-- signups POSTERIORES sí entren al modal de bienvenida / periodo de prueba.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE users ALTER COLUMN onboarded_at DROP DEFAULT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_exempt BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ALTER COLUMN trial_exempt SET DEFAULT FALSE;

-- ─── Agentes (cloud / escritorio) ──────────────────────────────
-- En self-host puro no se usan, pero el código de /storage los referencia y las
-- FK de storage_volumes/disk_format_log apuntan a esta tabla, así que debe existir.
CREATE TABLE IF NOT EXISTS agents (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_public_key   BYTEA NOT NULL,            -- Ed25519 (32 bytes)
    name_encrypted     BYTEA NOT NULL,
    name_nonce         BYTEA NOT NULL,
    platform           TEXT,                       -- 'windows' | 'linux' | 'macos'
    last_seen_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS agents_user_idx ON agents(user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_pairing_tokens (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash          BYTEA NOT NULL,
    name_encrypted     BYTEA NOT NULL,
    name_nonce         BYTEA NOT NULL,
    expires_at         TIMESTAMPTZ NOT NULL,
    used_at            TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_pairing_user_idx ON agent_pairing_tokens(user_id) WHERE used_at IS NULL;

-- ─── storage_volumes: pertenencia (usuario/agente) + capacidad ──
-- Un volumen vive en la máquina de un agente (cloud) o es local al backend
-- (self-host → agent_id NULL, flujo actual intacto). Relajamos el UNIQUE(path)
-- global a unicidad por (agent_id, path); para los locales (agent_id NULL) el
-- path sigue siendo único.
ALTER TABLE storage_volumes ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE CASCADE;
ALTER TABLE storage_volumes ADD COLUMN IF NOT EXISTS user_id  UUID REFERENCES users(id)  ON DELETE CASCADE;
ALTER TABLE storage_volumes DROP CONSTRAINT IF EXISTS storage_volumes_path_key;
CREATE UNIQUE INDEX IF NOT EXISTS storage_volumes_agent_path_idx
    ON storage_volumes(agent_id, path) WHERE agent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS storage_volumes_local_path_idx
    ON storage_volumes(path) WHERE agent_id IS NULL;
CREATE INDEX IF NOT EXISTS storage_volumes_user_idx ON storage_volumes(user_id);

-- Capacidad del disco registrado (bytes). El "Almacenamiento" del usuario =
-- cuota base + capacidad de sus discos en uso (display-only; no es un límite).
ALTER TABLE storage_volumes ADD COLUMN IF NOT EXISTS total_bytes BIGINT NOT NULL DEFAULT 0;

-- ─── disk_format_log: agente que originó el formateo (cloud) ────
ALTER TABLE disk_format_log ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
