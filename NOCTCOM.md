# Noctcom

> **Zero-Knowledge Storage** — Almacenamiento tipo Nextcloud donde ni el servidor ni nosotros podemos leer tus archivos.

[![Stack](https://img.shields.io/badge/stack-Next.js%2015%20%2B%20Fastify-7c3aed)]()
[![Crypto](https://img.shields.io/badge/crypto-libsodium%20%2F%20XChaCha20--Poly1305-8b5cf6)]()
[![License](https://img.shields.io/badge/license-AGPL--3.0-a78bfa)]()

---

## 🌒 El nombre

**Noctcom** — *noct* (latín *nox/noctis*, la noche) + *com* (command, communications, protocol). Es la sala de operaciones nocturna: un centro de comando donde tus datos viajan cifrados bajo el manto de la oscuridad. Dos sílabas, pronunciación idéntica en español e inglés, y resonancia con la cultura de las operaciones cifradas — *defcon*, *infocon*, *milcom*.

Búsquedas previas (mayo 2026): el término exacto **Noctcom** está libre de colisiones con software. Productos con nombres cercanos pero claramente distintos: *NocTel* (VoIP, telefonía), *Noctua* (refrigeración PC), *Noct.co* (estudio de diseño AI). Tu marca es distintiva y registrable.

Antes de registrar:
- Marca: [TMView (EU)](https://www.tmdn.org/tmview/) · [USPTO TESS](https://www.uspto.gov/trademarks)
- Dominio: `noctcom.com` (objetivo principal), alternativas `noctcom.app`, `noctcom.io`, `noctcom.sh`
- GitHub: `gh search repos noctcom`
- npm: `npm view @noctcom/cli` (debería dar 404)
- Verificar en [Namechk](https://namechk.com/) handles sociales: `@noctcom` en Twitter/X, Mastodon, GitHub

---

## ✨ Características

| Feature | Estado |
|---------|--------|
| 🔐 Cifrado end-to-end (XChaCha20-Poly1305 + Argon2id) | ✅ |
| 📁 CRUD de carpetas con 19 iconos + 7 colores | ✅ |
| 📤 Upload por chunks con presigned URLs (no toca el backend) | ✅ |
| 📥 Drag & drop de archivos desde el SO | ✅ |
| 🖱️ Drag & drop entre carpetas (mover/organizar) | ✅ |
| 🔍 Búsqueda local cifrada con paginación | ✅ |
| 🔑 2FA TOTP (Google/Authy/1Password) | ✅ |
| 🛡️ Passkeys (WebAuthn, phishing-resistant) | ✅ |
| ♻️ Recuperación con frase mnemónica de 12 palabras | ✅ |
| 🤝 Compartir E2E con sealed boxes (X25519) | ✅ |
| 📚 Versionado de archivos | ✅ |
| 🗑️ Papelera (soft delete) | ✅ |
| 🔄 Sync en tiempo real vía WebSocket | ✅ |

---

## 🏗️ Arquitectura

### Garantías criptográficas

| Dato | Visibilidad del servidor |
|------|--------------------------|
| Contraseña maestra | ❌ Nunca sale del dispositivo |
| Claves privadas (Ed25519 + X25519) | ❌ Cifradas con MK derivada del password |
| Contenido de archivos | ❌ Chunks XChaCha20-Poly1305 con file_key cliente-side |
| Nombres de archivos y carpetas | ❌ Cifrados con vault_key |
| Iconos y colores de carpetas | ❌ Cifrados (dentro de `metadata_encrypted`) |
| Metadatos (tamaño real, mime, tags) | ❌ Cifrados |
| Email | ⚠️ Solo BLAKE2b(email) para lookup |
| Audit log | ❌ Cifrado con MK del usuario |
| TOTP secret | ⚠️ Cifrado con HKDF(MK, "noctcom.totp.v1") |

### Stack

```
┌────────────────────────────────────────────────────┐
│  Frontend — Next.js 15 + React 19 + Tailwind 4    │
│  • libsodium-wrappers-sumo (WASM)                  │
│  • @dnd-kit/core (drag & drop)                     │
│  • @simplewebauthn/browser (passkeys)              │
│  • Zustand (state) + TanStack Query                │
└──────────────────┬─────────────────────────────────┘
                   │ HTTPS / WSS
                   ▼
┌────────────────────────────────────────────────────┐
│  Caddy 2 — Reverse proxy + TLS automático          │
└──────────────────┬─────────────────────────────────┘
                   ▼
┌────────────────────────────────────────────────────┐
│  Backend — Fastify + TypeScript                    │
│  • JWT + refresh tokens                            │
│  • Rate limiting (Redis)                           │
│  • Presigned URLs (chunks → MinIO direct)          │
└─────┬────────────┬────────────┬────────────────────┘
      ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐
│PostgreSQL│ │  Redis   │ │    MinIO     │
│ metadata │ │ sessions │ │  ciphertext  │
└──────────┘ └──────────┘ └──────────────┘
```

---

## 🚀 Arranque rápido

### Requisitos

- Docker + Docker Compose v2
- Node.js 22+ (solo para desarrollo)
- Un dominio (producción) o `localhost` (dev)

### Desarrollo local

```bash
# 1. Clonar y configurar
git clone <tu-repo> noctcom && cd noctcom
cp .env.example .env

# 2. Generar secretos
bash scripts/gen-secrets.sh   # o manual:
sed -i.bak \
  "s|__GENERATE_WITH__openssl_rand_-base64_32__|$(openssl rand -base64 32 | tr -d '\n')|g; \
   s|__GENERATE_WITH__openssl_rand_-base64_64__|$(openssl rand -base64 64 | tr -d '\n')|g" \
  .env

# 3. Levantar servicios de infraestructura
docker compose up -d postgres redis minio minio-init
docker compose logs -f minio-init   # esperar "MinIO bucket ready"

# 4. Backend
cd backend
npm install
npm run dev   # http://localhost:3000

# 5. Frontend (en otra terminal)
cd frontend
npm install
npm run dev   # http://localhost:3001
```

### Producción

```bash
# DNS: app.tu-dominio.com y api.tu-dominio.com → tu VPS
export CADDY_DOMAIN=tu-dominio.com
export CADDY_EMAIL=admin@tu-dominio.com

docker compose up -d --build
```

Caddy emite certificados Let's Encrypt automáticamente.

---

## 📂 Estructura del proyecto

```
noctcom/
├── .env.example
├── docker-compose.yml
├── README.md
│
├── docker/
│   ├── caddy/Caddyfile
│   └── postgres/init/
│       ├── 01_schema.sql          # tablas core
│       └── 02_auth_extensions.sql # 2FA, passkeys, recovery
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts              # bootstrap Fastify
│       ├── config.ts              # Zod env validation
│       ├── crypto/index.ts        # primitivas libsodium
│       ├── db/
│       │   ├── pool.ts            # pg pool + tx()
│       │   └── redis.ts
│       ├── storage/s3.ts          # MinIO + presigned URLs
│       └── routes/
│           ├── auth.ts            # signup/login/refresh
│           ├── two_factor.ts      # TOTP + WebAuthn + recovery
│           ├── vaults.ts          # bóvedas
│           ├── nodes.ts           # CRUD carpetas/archivos
│           ├── uploads.ts         # presigned + chunks
│           ├── shares.ts          # compartir E2E
│           └── ws.ts              # sync en tiempo real
│
├── frontend/
│   ├── package.json
│   ├── next.config.mjs
│   ├── tsconfig.json
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css            # paleta dark + violetas
│   │   ├── page.tsx               # landing
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx     # login + TOTP + passkey
│   │   │   ├── signup/page.tsx    # signup + mnemónica
│   │   │   └── recovery/page.tsx  # recuperación con frase
│   │   └── (app)/
│   │       ├── layout.tsx         # sidebar + topbar
│   │       └── vault/page.tsx     # grid + drag&drop + paginación
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   └── Input.tsx
│   │   └── vault/
│   │       ├── folder-icons.tsx   # 19 iconos + 7 colores
│   │       └── NewFolderModal.tsx
│   └── lib/
│       ├── crypto.ts              # libsodium client-side
│       ├── api.ts                 # fetch wrapper con JWT
│       ├── auth-store.ts          # Zustand (MK en memoria)
│       └── utils.ts
│
└── mobile/                        # React Native (pendiente)
```

---

## 🔐 Flujos criptográficos

### Signup

```
Usuario teclea password
   │
   ▼
Argon2id(password, salt) ──► Master Key (MK) [solo en memoria]
   │
   ├─► Generar Ed25519 keypair (identity, firmas)
   ├─► Generar X25519 keypair (exchange, sealed boxes)
   ├─► Wrappear privkeys con MK (XChaCha20-Poly1305)
   ├─► Crear vault inicial: random vault_key
   │   └─► Wrappear vault_key con HKDF(MK, "noctcom.vault.wrap")
   ├─► Generar frase mnemónica de 12 palabras (recovery)
   └─► POST /api/v1/auth/signup con TODAS las pubkeys + privkeys wrapped
```

El servidor **NUNCA** recibe la contraseña, MK ni privkeys descifradas.

### Login

```
1. POST /auth/login/init { emailHash: BLAKE2b(email) }
   └─► server devuelve { kdfSalt, kdfOps, kdfMem, challenge }

2. Cliente: Argon2id(password, salt) → MK
            crypto_sign_seed_keypair(HKDF(MK, "noctcom.login.sign")) → kp
            sign(challenge, kp.privateKey) → signature

3. POST /auth/login/finalize { signature, ...wrapped privkeys vienen }
   └─► server verifica signature con identity_public_key
       devuelve JWT + privkeys wrapped + (totpRequired?)

4. Cliente desempaqueta privkeys con MK → guarda en memoria
```

### Upload

```
1. Cliente genera file_key aleatoria (XChaCha20 key)
2. Trocea archivo en chunks de 4 MiB
3. Cifra cada chunk: encrypt(chunk, file_key, AAD="chunk:N")
4. Wrappea file_key con vault_key (que ya está en memoria)
5. POST /uploads/init con metadata + N chunks declarados
   └─► server devuelve N presigned PUT URLs
6. Cliente sube cada chunk DIRECTO a MinIO (sin tocar backend)
7. POST /uploads/:versionId/complete con auth tags + content_hash
```

### Compartir E2E

```
1. Cliente A obtiene exchange_public_key de B (GET /auth/users/lookup/:user)
2. A descifra su file_key con su vault_key
3. A genera sealed_box: crypto_box_seal(file_key, B_exchange_pubkey)
4. POST /shares con { nodeId, sharedWith: B, sealedKey }
5. B llama GET /shares/incoming, recibe sealed_key
6. B abre con su exchange_private_key → tiene file_key → puede descifrar
```

---

## 🛣️ Roadmap

### v0.2 — Pulido criptográfico
- [ ] OPAQUE real (`@cloudflare/opaque-core` o `opaque-ts`)
- [ ] BIP39 oficial (`@scure/bip39`) para la frase mnemónica
- [ ] Verificación de attestation WebAuthn con `@simplewebauthn/server`
- [ ] Padding Padmé para reducir leak de tamaño
- [ ] Tests E2E del flujo signup→login→upload→share

### v0.3 — UX
- [ ] Cliente CLI (`noctcom cli upload ~/Downloads/foo.pdf`)
- [ ] Vista previa cliente-side de imágenes/PDFs (sin desencriptar full file)
- [ ] Subida resumida (resumir uploads interrumpidos)
- [ ] Sincronización tipo Dropbox (folder watcher)
- [ ] Cliente desktop con Tauri

### v0.4 — Mobile
- [ ] React Native app (iOS + Android)
- [ ] Biometric unlock (FaceID/TouchID)
- [ ] Background upload con cifrado

### v0.5 — Empresa
- [ ] Multi-tenant
- [ ] Audit log avanzado
- [ ] SCIM provisioning
- [ ] Self-hosted con backups automáticos

---

## 🤝 Contribuir

```bash
# Tests
cd backend && npm test
cd frontend && npm test

# Lint + typecheck
npm run lint && npm run typecheck

# Lanzar todo el stack en modo dev
docker compose -f docker-compose.dev.yml up
```

---

## 📜 Licencia

AGPL-3.0 — Si haces fork, publicas el código.

---

<sub>Built with paranoia. Audited by mathematics. © 2026 · Noctcom</sub>
