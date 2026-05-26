-- ───────────────────────────────────────────────────────────────
-- Admin role + disk format audit log
-- ───────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

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

CREATE INDEX IF NOT EXISTS disk_format_log_user_idx
    ON disk_format_log(user_id, created_at DESC);
