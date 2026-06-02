-- ─── 2FA por email (OTP en login) ───────────────────────────────
-- El passkey (WebAuthn) ya se infiere de webauthn_credentials. Aquí
-- añadimos el segundo factor "fácil": un OTP de 6 dígitos enviado al
-- email del usuario. El servidor no guarda el email en claro; el cliente
-- lo reenvía transitoriamente en el login para poder mandar el código
-- (igual que en signup), y solo se persiste el hash del OTP.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS two_factor_email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS login_otp_hash       BYTEA,
    ADD COLUMN IF NOT EXISTS login_otp_expires    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS login_otp_attempts   SMALLINT NOT NULL DEFAULT 0;
