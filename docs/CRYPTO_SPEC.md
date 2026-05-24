# Especificación criptográfica de Noctcom

> Documento técnico que describe, con precisión algorítmica, todas las operaciones criptográficas de Noctcom. Si encuentras una discrepancia entre este documento y el código, el código es la verdad y abre un issue.

**Versión:** 1.0
**Última revisión:** 24 de mayo de 2026
**Implementación de referencia:** `backend/src/crypto/index.ts`, `frontend/lib/crypto.ts`

---

## 1. Notación y convenciones

- `||` = concatenación
- `KDF(...)` = función de derivación de claves
- `AEAD.enc(K, N, P, AAD)` = cifrado autenticado con clave K, nonce N, plaintext P, additional data AAD
- `AEAD.dec(K, N, C, AAD)` = descifrado con autenticación
- Todos los bytes en serialización: **base64url sin padding** (RFC 4648 §5)
- Endianness: **little-endian** donde aplica (consistente con libsodium)

## 2. Primitivas

| Símbolo | Algoritmo | Librería | Parámetros |
|---------|-----------|----------|------------|
| `KDF` | Argon2id | libsodium `crypto_pwhash` | `ALG_ARGON2ID13`, ver §3.1 |
| `AEAD` | XChaCha20-Poly1305 (IETF) | libsodium `crypto_aead_xchacha20poly1305_ietf_*` | nonce 24B, tag 16B |
| `HKDF` | BLAKE2b-keyed | libsodium `crypto_generichash` con MK como key | output 32B |
| `Sign` | Ed25519 | libsodium `crypto_sign_*` | RFC 8032 |
| `KX` | X25519 | libsodium `crypto_box_*` | RFC 7748 |
| `Seal` | Sealed boxes (X25519 + XSalsa20-Poly1305) | libsodium `crypto_box_seal*` | nonce derivado |
| `Hash` | BLAKE2b-256 | libsodium `crypto_generichash` | output 32B |

**Justificación de elecciones:**
- XChaCha20 sobre AES-GCM: nonces de 24 bytes permiten generación aleatoria sin riesgo práctico de colisión. Mejor rendimiento sin AES-NI (móviles, IoT).
- Argon2id sobre PBKDF2/scrypt: ganador PHC 2015, resistente a GPU/ASIC, estado del arte.
- Ed25519 sobre ECDSA: firmas determinísticas, sin nonces (no se rompe por mal RNG), batch-verifiable.
- BLAKE2b sobre SHA-256: keyed mode nativo (HMAC innecesario), 2-3x más rápido.

## 3. Derivación de claves

### 3.1 Master Key (MK) desde contraseña

```
Input:
  password ∈ string (UTF-8, longitud >= 8)
  salt ∈ Bytes(16)  — random per-user, persistido en plaintext en BD
  opsLimit ∈ ℤ
  memLimit ∈ ℤ

Output:
  MK ∈ Bytes(32)

Computation:
  MK = Argon2id(
    password = password,
    salt = salt,
    iterations = opsLimit,
    memory = memLimit,
    parallelism = 1,
    hash_length = 32,
    variant = ARGON2ID13
  )
```

**Parámetros por defecto (mayo 2026):**
- `opsLimit = 3` (libsodium `OPSLIMIT_MODERATE`)
- `memLimit = 268_435_456` bytes = 256 MiB (libsodium `MEMLIMIT_MODERATE`)
- Tiempo aproximado: 0.7s en MacBook M2, 2.5s en iPhone 15

**Migración de parámetros:** si en el futuro aumentamos `opsLimit` o `memLimit`, el campo `kdf_ops_limit` y `kdf_mem_limit` por usuario se actualizan en login exitoso → re-wrap silencioso con parámetros más fuertes.

### 3.2 Sub-keys desde MK

Cuando necesitamos una clave especializada (TOTP wrap, vault wrap, login signing), derivamos con HKDF-like BLAKE2b keyed:

```
Input:
  MK ∈ Bytes(32)
  context ∈ string  — etiqueta de dominio

Output:
  K_sub ∈ Bytes(32)

Computation:
  K_sub = BLAKE2b(
    message = utf8(context),
    key = MK,
    output_length = 32
  )
```

**Contextos definidos (registry):**

| Contexto | Uso | Versión |
|----------|-----|---------|
| `"noctcom.vault.wrap"` | Wrap de vault keys | v1 |
| `"noctcom.totp.v1"` | Wrap del TOTP secret en BD | v1 |
| `"noctcom.login.sign"` | Seed para keypair de login | v1 |
| `"noctcom.recovery.derive"` | Derivar recovery key desde mnemonic | v1 |
| `"noctcom.audit.encrypt"` | Cifrar entradas de audit log | v1 |

**Regla de versionado:** si cambia el uso de un contexto, se sufija con `v2`, `v3`, etc. Nunca se reutiliza.

### 3.3 Recovery key desde frase mnemónica

```
Input:
  mnemonic ∈ string[12]  — palabras BIP39

Output:
  RK ∈ Bytes(32)

Computation:
  seed = BIP39.mnemonicToSeed(mnemonic, passphrase = "")
  RK = BLAKE2b(
    message = utf8("noctcom.recovery.derive"),
    key = seed[0:32],
    output_length = 32
  )
```

La RK puede desempaquetar las mismas privkeys que la MK. Durante signup, las privkeys se wrappean dos veces (con MK y con RK).

## 4. Keypairs del usuario

### 4.1 Identity keypair (Ed25519, firmas)

```
seed_sign = HKDF(MK, "noctcom.login.sign")
(sk_id, pk_id) = Ed25519.seed_keypair(seed_sign)
```

**Determinístico:** el mismo password + salt → mismo keypair. Esto permite que el cliente firme el challenge de login sin necesidad de almacenar `sk_id` aparte (aunque también lo almacenamos wrappeado para consistencia).

### 4.2 Exchange keypair (X25519, sealed boxes)

```
(sk_ex, pk_ex) = X25519.keypair()  // genuinamente aleatorio
```

**No determinístico:** generado con CSPRNG en signup. Para que el usuario pueda recibir archivos compartidos en diferentes dispositivos, `sk_ex` se wrappea con la MK y se almacena en el servidor.

### 4.3 Persistencia en BD

```
users.identity_public_key = pk_id                       // plaintext, 32 bytes
users.identity_private_key_wrapped = AEAD.enc(MK, N1, sk_id, AAD=null)
users.identity_private_key_nonce = N1                   // 24 bytes

users.exchange_public_key = pk_ex                       // plaintext, 32 bytes
users.exchange_private_key_wrapped = AEAD.enc(MK, N2, sk_ex, AAD=null)
users.exchange_private_key_nonce = N2
```

## 5. Wrap de claves

Patrón uniforme para todas las claves secundarias:

```
function Wrap(key_to_wrap, wrapping_key):
  nonce = random(24)
  ciphertext = AEAD.enc(wrapping_key, nonce, key_to_wrap, AAD=null)
  return (ciphertext, nonce)

function Unwrap(ciphertext, nonce, wrapping_key):
  return AEAD.dec(wrapping_key, nonce, ciphertext, AAD=null)
```

**Jerarquía de claves:**

```
              password
                 │ Argon2id
                 ▼
                MK ──┬─── HKDF("vault.wrap") ──→ K_vault_wrap
                     │                                │
                     │                                ▼ Unwrap
                     │                          vault_key
                     │                                │ AEAD
                     │                                ▼ Unwrap
                     │                          file_key
                     │                                │ AEAD per chunk
                     │                                ▼
                     │                          plaintext chunks
                     │
                     ├─── HKDF("totp.v1") ──→ K_totp_wrap → TOTP secret
                     ├─── HKDF("login.sign") → seed → (sk_id, pk_id)
                     └─── Unwrap ──→ sk_ex (almacenado wrappeado)
```

## 6. Cifrado de archivos

### 6.1 Chunking

```
Input:
  file ∈ Bytes  — archivo arbitrario
  file_key ∈ Bytes(32)

Output:
  chunks: [(index, ciphertext, nonce, tag)]

Algorithm:
  CHUNK_SIZE = 4 * 1024 * 1024  // 4 MiB
  index = 0
  for offset in 0, CHUNK_SIZE, 2*CHUNK_SIZE, ...:
    plaintext = file[offset : offset + CHUNK_SIZE]
    nonce = random(24)
    aad = utf8(f"chunk:{index}")
    full_ciphertext = AEAD.enc(file_key, nonce, plaintext, aad)
    // libsodium incluye el tag de 16 bytes al final del ciphertext
    ciphertext = full_ciphertext[: -16]
    tag = full_ciphertext[-16 :]
    yield (index, ciphertext, nonce, tag)
    index += 1
```

**Por qué AAD = `"chunk:N"`:** previene **reorder attacks**. Un atacante con acceso al storage no puede intercambiar chunks; el AAD vincula cada chunk a su posición.

### 6.2 Descifrado

```
function decryptChunk(ciphertext, nonce, index, file_key):
  aad = utf8(f"chunk:{index}")
  full = ciphertext || tag  // recomponer si se guardan separados
  return AEAD.dec(file_key, nonce, full, aad)
```

Si cualquier chunk falla la verificación, **el archivo entero se considera comprometido**. No descifrado parcial.

### 6.3 Content hash (integridad de versión)

```
function contentHash(chunks: [(index, ciphertext, nonce, tag)]):
  state = BLAKE2b.init(output_length=32)
  for chunk in sorted(chunks, by=index):
    state.update(chunk.ciphertext)
  return state.finalize()
```

Se almacena en `file_versions.content_hash` y se verifica en cada descarga.

## 7. Cifrado de metadatos

Todos los nombres y metadatos sensibles se cifran con la **vault_key** correspondiente:

| Campo | Encrypt con | Plaintext format |
|-------|-------------|------------------|
| `nodes.name_encrypted` | vault_key | UTF-8 string |
| `nodes.metadata_encrypted` | vault_key | JSON: `{mime, size, mtime, icon, color, tags[]}` |
| `vaults.name_encrypted` | exchange_private_key (owner) | UTF-8 string |
| `audit_log.event_encrypted` | MK directamente | JSON: `{action, target_id, timestamp, ip_hash}` |

Cada uno con su propio nonce de 24 bytes en columna paralela.

## 8. Email hash (lookup sin email)

```
function hashEmail(email: string) -> Bytes(32):
  normalized = email.trim().lower()
  return BLAKE2b(
    message = utf8(normalized),
    key = utf8("noctcom.email.v1"),
    output_length = 32
  )
```

**Trade-off conocido:** un dump de BD permite verificar si un email específico tiene cuenta (oracle ataque). No permite enumerar emails sin un diccionario. Aceptamos esto a cambio de no almacenar emails en claro.

## 9. Compartir archivos (sealed boxes)

Cuando Alice comparte un archivo con Bob:

```
function shareFile(file_key, bob_exchange_public_key):
  sealed_key = libsodium.crypto_box_seal(file_key, bob_exchange_public_key)
  return sealed_key

function receiveShare(sealed_key, my_exchange_keypair):
  file_key = libsodium.crypto_box_seal_open(sealed_key, my_pk, my_sk)
  return file_key
```

**Propiedades:**
- **Anonimidad del emisor:** la sealed box no incluye la identidad de Alice; Bob solo sabe que alguien le compartió, no quién (esa info la añade el servidor en `shares.shared_by`, pero criptográficamente la primitiva es anónima)
- **Solo Bob puede abrir:** ni Noctcom ni nadie más con acceso a `sealed_key` puede leerlo sin `bob_sk_ex`

## 10. TOTP zero-knowledge

El secreto TOTP (20 bytes random) se cifra con una sub-key derivada de la MK:

```
K_totp_wrap = HKDF(MK, "noctcom.totp.v1")
totp_secret_wrapped, totp_nonce = Wrap(totp_secret, K_totp_wrap)
```

**Durante login con 2FA activo:**

```
1. Cliente deriva K_totp_wrap localmente (tiene MK en memoria)
2. Cliente envía K_totp_wrap al servidor junto con el código de 6 dígitos
3. Servidor desempaqueta totp_secret en memoria volátil
4. Servidor verifica TOTP(secret, code, time_now, window=1)
5. Servidor zeroes K_totp_wrap y totp_secret inmediatamente
6. Servidor responde OK/FAIL
```

**Justificación:** el servidor necesita el `secret` para verificar el código. La alternativa pura zero-knowledge (cliente envía HMAC del código + timestamp) tiene problemas de sincronización con apps autenticadoras estándar. Este compromiso garantiza que el secret **solo es desempaquetable durante una sesión activa autenticada**.

## 11. Generación de aleatoriedad

Todos los random bytes provienen de:

- **Cliente:** `crypto.getRandomValues()` (Web Crypto API) en navegador, `crypto.randomBytes` en Node, `SecureRandom` en mobile
- **Servidor:** `crypto.randomBytes()` de Node.js, que usa `/dev/urandom` o `BCryptGenRandom`

**Nunca usamos `Math.random()` ni equivalentes para nada criptográfico.**

## 12. Manejo de memoria sensible

En cuanto una clave deja de ser necesaria, llamamos a `sodium.memzero(buffer)` para sobreescribir con ceros:

- MK: zeroed en `logout()` y en `lock()` (timeout de inactividad)
- File keys: zeroed después de cada operación de upload/download
- Sub-keys derivadas: zeroed en el mismo turno donde se usan

**Limitación conocida:** JavaScript no garantiza control sobre la memoria de strings inmutables. Si un atacante hace heap dump entre `derive()` y `memzero()`, la clave podría estar duplicada. Esto es un riesgo aceptado a nivel de motor.

## 13. Versionado y rotación

El sistema soporta migración de algoritmos sin re-cifrar todos los datos:

- Cada chunk lleva un campo `algorithm_version` (default `1` = XChaCha20-Poly1305 + Argon2id)
- Si actualizamos a v2 (ej. post-quantum), nuevos uploads usan v2
- Datos antiguos en v1 se migran on-read, oportunísticamente

**Plan de rotación de algoritmos (roadmap):**
- v1 (actual): XChaCha20-Poly1305 + Argon2id + Ed25519 + X25519
- v2 (planeado): + Kyber768 KEM para shared keys (resistente a quantum)
- v3 (planeado): Dilithium para signatures + nuevo KDF (Balloon hash o similar)

## 14. Referencias normativas

- RFC 7693 — BLAKE2 crypto hash
- RFC 7748 — X25519
- RFC 8032 — Ed25519
- RFC 8439 — ChaCha20 and Poly1305
- RFC 9106 — Argon2 (incluyendo Argon2id)
- BIP-0039 — Mnemonic codes
- NIST SP 800-38D — AEAD modes
- libsodium documentation: https://doc.libsodium.org/

## 15. Auditorías

| Fecha | Auditor | Scope | Findings | Report |
|-------|---------|-------|----------|--------|
| — | — | — | — | — |

*Cuando se realicen auditorías externas, esta tabla se actualizará con enlaces a los reports completos publicados.*

---

**Hash de este documento (para integridad referencial):**
```
BLAKE2b-256(CRYPTO_SPEC.md v1.0) = [se calcula en el release]
```

*Este hash se firma con la PGP del proyecto en cada release. Verifica contra el `SIGNATURES.txt` del tag de GitHub.*
