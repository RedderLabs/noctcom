# Noctcom

Almacenamiento privado con **encriptación de conocimiento cero**.
El servidor no puede leer ni nombres de archivo, ni contenido, ni metadatos.

## Garantías criptográficas

| Dato | Visibilidad del servidor |
|------|--------------------------|
| Contraseña | Nunca sale del cliente (OPAQUE + Argon2id) |
| Claves privadas | Cifradas con la MK derivada del password |
| Contenido de archivos | Chunks `XChaCha20-Poly1305`, key cliente-side |
| Nombres de archivo y carpetas | `XChaCha20-Poly1305` con vault_key |
| Metadatos (tamaño real, mime, tags) | Cifrados |
| Email | Solo `BLAKE2b(email)` para login lookup |
| IP del cliente | Solo hash, para auditoría |
| Audit log | Cifrado con la MK |

Lo único que ve el servidor: tamaño del ciphertext, número de chunks, timestamps de subida, estructura del árbol (qué archivo pertenece a qué carpeta, todos los nombres cifrados), y la **gráfica de qué usuario comparte con qué usuario** (esto es metadata difícil de ocultar sin oblivious RAM).

## Stack

- **Backend:** Fastify + TypeScript + libsodium
- **Frontend:** Next.js 15 (web) + React Native (móvil) — pendientes en `frontend/` y `mobile/`
- **BD:** PostgreSQL 16
- **Object storage:** MinIO (S3 API), cliente sube DIRECTO con presigned URLs
- **Cache/PubSub:** Redis 7
- **Proxy/TLS:** Caddy 2 con cert automáticos

## Arranque local (dev)

```bash
cp .env.example .env
# Genera secretos:
sed -i "s|__GENERATE_WITH__openssl_rand_-base64_32__|$(openssl rand -base64 32)|" .env
# (repite para cada placeholder o usa un script)

docker compose up -d postgres redis minio minio-init
docker compose logs -f minio-init   # espera "MinIO bucket ready"

cd backend && npm install && npm run dev
```

## Producción

```bash
# Apunta los DNS app.tu-dominio.com y api.tu-dominio.com al VPS
export CADDY_DOMAIN=tu-dominio.com
export CADDY_EMAIL=admin@tu-dominio.com
docker compose --profile production up -d
```

## Flujos clave (cliente)

### Signup
1. Argon2id(password, salt) → MK
2. Genera Ed25519 + X25519 keypairs
3. Wrappea privkeys con MK
4. Crea vault inicial: random vault_key, wrappeada con exchange_private_key
5. POST `/api/v1/auth/signup` con todo el material wrapped + pubkeys

### Login
1. POST `/auth/login/init` con `BLAKE2b(email)` → recibe salt + KDF params + challenge
2. Argon2id(password, salt) → MK localmente
3. Desempaqueta identity_private_key con la MK
4. Firma el challenge con Ed25519
5. POST `/auth/login/finalize` con la firma → recibe JWT + privkeys wrapped

### Upload
1. Genera `file_key` aleatoria
2. Trocea el archivo, cifra cada chunk con `XChaCha20-Poly1305(file_key, nonce_i, AAD="chunk:i")`
3. Wrappea `file_key` con `vault_key`
4. Cifra nombre y metadata con `vault_key`
5. POST `/uploads/init` → recibe N presigned PUT URLs
6. PUT cada chunk directo a MinIO
7. POST `/uploads/:versionId/complete` con `content_hash`

### Compartir
1. GET `/auth/users/lookup/:username` → recipient's `exchange_public_key`
2. `sealed_key = crypto_box_seal(file_key, recipient_pubkey)`
3. POST `/shares` con `sealed_key`. El recipient lo abre con su exchange_privkey.

## Decisiones de diseño

- **XChaCha20-Poly1305** (no AES-GCM): nonces de 24 bytes generables aleatoriamente sin riesgo de colisión, y mejor rendimiento sin AES-NI (móvil).
- **Argon2id** sobre PBKDF2/scrypt: estado del arte contra GPU/ASIC.
- **OPAQUE** sobre SRP/PAKE básicos: el servidor nunca recibe nada que permita un offline crack incluso si la BD se filtra.
- **Chunks de 4 MiB con AAD por índice**: previene reorder attacks y permite reanudar uploads.
- **Presigned URLs**: el backend no toca los blobs → escala horizontalmente sin estado.
- **Soft delete** en `nodes`: papelera real, recovery posible hasta el purge.
- **Versionado** en `file_versions`: rollback sin recifrar todo.
- **AAD en chunks** vincula cada chunk a su índice (impide reordenar trozos).

## Lo que falta para producción

- [ ] OPAQUE real (lib `@cloudflare/opaque-core` o `opaque-ts`)
- [ ] BIP39 oficial para recovery (`@scure/bip39`)
- [ ] Detección de ciclos en move de carpetas
- [ ] Reenvelope al rotar password (re-wrap todas las privkeys del usuario)
- [ ] Rotación de file_key bajo demanda
- [ ] Verificación de fingerprints de pubkeys entre usuarios (TOFU/SAS)
- [ ] Padding de tamaños para reducir leakage de tamaño (Padmé)
- [ ] Frontend (`frontend/`) y app móvil (`mobile/`)
- [ ] Tests E2E criptográficos
- [ ] Backup cifrado del bucket de MinIO
