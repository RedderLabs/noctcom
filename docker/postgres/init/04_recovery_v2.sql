-- ═══════════════════════════════════════════════════════════════
-- Noctcom — Migración 04: Recovery v2 (kit de recuperación completo)
--
-- Hasta ahora la mnemónica solo permitía firmar el challenge de
-- recuperación (recovery_public_key): se recuperaba la CUENTA pero
-- las vault keys quedaban wrapped con la MK vieja → archivos perdidos.
--
-- Recovery v2: de la mnemónica se deriva además un par X25519
-- ("recovery box"). Su pública se guarda aquí; con ella el cliente
-- puede SELLAR (crypto_box_seal) la vault key en cualquier momento
-- sin tener la mnemónica a mano. En recuperación, la mnemónica
-- deriva la privada, abre los seals y re-wrappea con la nueva MK.
-- El servidor solo ve ciphertext: zero-knowledge intacto.
-- ═══════════════════════════════════════════════════════════════

-- Ed25519 pública de recovery v1 (firma el challenge de recuperación de la
-- CUENTA). Estaba en el init de la nube (scripts/init-db.sql) pero nunca se
-- portó al self-host, así que el INSERT de signup fallaba con
-- «column "recovery_public_key" does not exist». Se backfillea aquí.
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_public_key BYTEA;

-- X25519 pública derivada de la mnemónica (plaintext: es pública).
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_box_public_key BYTEA;

-- sk_exchange sellada a la recovery box key. Preserva los archivos
-- compartidos CONTIGO tras una recuperación (los sealed_key de shares
-- van cifrados a tu exchange_public_key, que así no cambia).
ALTER TABLE users ADD COLUMN IF NOT EXISTS exchange_private_key_sealed_recovery BYTEA;

-- vault_key sellada a la recovery box key del owner (80 bytes:
-- 32 ephemeral pk + 32 key + 16 MAC). Sin nonce: el seal lo embebe.
ALTER TABLE vaults ADD COLUMN IF NOT EXISTS vault_key_sealed_recovery BYTEA;
