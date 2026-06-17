# Noctcom

Almacenamiento privado con **cifrado de conocimiento cero**.
El servidor no puede leer ni nombres de archivo, ni contenido, ni metadatos.

**[noctcom.com](https://noctcom.com)** | [Seguridad](https://noctcom.com/security) | [Documentos](https://github.com/RedderLabs/noctcom/tree/main/docs)

## Self-Host (5 minutos)

**Un comando** — descarga el instalador, **instala Docker si falta**, te pregunta
el dominio, genera los secretos y lo arranca todo. Con dominio: TLS automático;
sin dominio: modo LAN (`https://<IP>` con certificado interno, ideal para homelab):

```bash
curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/install.sh | bash
```

**En Proxmox VE** — crea un LXC Debian, instala Docker dentro y lo levanta todo
(ejecutar como root en el host Proxmox; manual paso a paso en
[`docs/INSTALL_PROXMOX.md`](docs/INSTALL_PROXMOX.md)):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
```

**O a mano**, si prefieres controlar cada paso:

```bash
git clone https://github.com/RedderLabs/noctcom.git
cd noctcom
cp .env.example .env
# Edita .env: cambia CADDY_DOMAIN, todas las passwords, y JWT_SECRET
docker compose up -d
```

Esto levanta PostgreSQL, Redis, MinIO, Backend, Frontend y Caddy (TLS automático).
Tu instancia estará en `https://app.tu-dominio.com`.

### Requisitos

- **Un Linux con acceso a internet.** El instalador en un comando **instala
  Docker por ti si no está** (cualquier distro con apt/dnf/yum/apk/pacman); para
  la vía manual necesitas Docker + Compose v2. En Proxmox, el script LXC también
  instala Docker dentro del contenedor.
- **≥ 4 GB de RAM recomendado**: el build de Next.js necesita > 2 GiB; en runtime
  Argon2id usa 256 MiB.
- Dominio con DNS apuntando al servidor — opcional: sin dominio funciona en
  modo LAN por IP con HTTPS interno (certificado autofirmado)

## Garantías criptográficas

| Dato | Visibilidad del servidor |
|------|--------------------------|
| Contraseña | Nunca sale del cliente (Argon2id) |
| Claves privadas | Cifradas con la MK derivada del password |
| Contenido de archivos | Chunks `XChaCha20-Poly1305`, clave cliente-side |
| Nombres de archivo y carpetas | `XChaCha20-Poly1305` con vault_key |
| Metadatos (mime, tags) | Cifrados con vault_key |
| Email | Solo `BLAKE2b(email)` para login |
| IP del cliente | Solo hash, para auditoría |
| Audit log | Cifrado con la MK |

Lo que ve el servidor: tamaño del ciphertext, timestamps, estructura del arbol (con nombres cifrados), y grafo de shares entre usuarios.

## Funcionalidades

- **Vault cifrado E2E** — archivos, carpetas, nombres, metadatos
- **Previsualizacion de archivos** — imagenes (con zoom), video, audio, PDF, codigo fuente, texto
- **Drag & drop** — arrastra archivos o muevalos entre carpetas
- **Compartir E2E con contactos** — solicitas contacto → te aceptan → compartes. La clave del archivo se sella con la pubkey del destinatario (sealed box) y el receptor la descarga y descifra en su dispositivo. Solo entre contactos aceptados (consentimiento mutuo, anti-spam)
- **Contactos** — lista de personas de confianza; al aceptar se fija (TOFU) su clave pública
- **2FA** — passkeys (WebAuthn: huella digital o Face ID) o codigo de un solo uso por email
- **Recuperacion** — frase de 12 palabras (BIP39) que restaura cuenta y archivos
- **Onboarding guiado** — tour de bienvenida en el primer login (ES/EN)
- **Multi-dispositivo** — registro, gestion y revocacion de dispositivos
- **Perfil de usuario** — panel admin, gestion de roles, sesiones activas
- **Almacenamiento externo** — discos USB/SATA detectados y registrados desde la UI
  (agente local "Noctcom Connector"; en el cloud gestionado va con los planes de
  pago — en self-host siempre disponible)
- **Prueba de 30 dias con 10 GB** en el cloud gestionado (noctcom.com); despues,
  cuenta gratuita de 1 GB para siempre, sin borrados (el self-host no tiene
  planes ni trial: es gratis e ilimitado)
- **Formateo de discos** — ext4/xfs desde la web (en Linux)
- **Actividad cifrada** — log de eventos descifrado solo en el cliente
- **Papelera** — soft delete con restauracion
- **Destacados** — archivos favoritos
- **Sync real-time** — Redis pub/sub + WebSocket + BroadcastChannel
- **Notificaciones push** — FCM (Firebase Cloud Messaging)
- **Accesibilidad** — escala de fuente, sidebar colapsable, tema claro/oscuro
- **Bilingue** — espanol e ingles en web, app, emails y agente
- **Manual integrado** — documentacion dentro de la app

## Stack

| Componente | Tecnologia |
|---|---|
| Backend | Fastify + TypeScript + libsodium-sumo |
| Frontend | Next.js 15 + Tailwind v4 + Zustand |
| Base de datos | PostgreSQL 16 |
| Object storage | MinIO (S3 API) / Backblaze B2 |
| Cache/PubSub | Redis 7 |
| Proxy/TLS | Caddy 2 (certificados automaticos) |
| Cifrado | XChaCha20-Poly1305 + Argon2id + Ed25519 + X25519 |

## Flujos criptograficos

### Signup
1. `Argon2id(password, salt)` → Master Key (MK)
2. Genera Ed25519 (firma) + X25519 (intercambio) keypairs
3. Wrappea privkeys con MK
4. Crea vault: random vault_key, wrappeada con MK
5. `POST /api/v1/auth/signup` con material wrapped + pubkeys

### Login
1. `POST /auth/login/init` con `BLAKE2b(email)` → salt + challenge
2. `Argon2id(password, salt)` → MK localmente
3. Firma el challenge con Ed25519
4. `POST /auth/login/finalize` → JWT (7 dias) + privkeys wrapped

### Upload
1. Genera `file_key` aleatoria
2. Trocea en chunks de 4 MiB, cifra con `XChaCha20-Poly1305(file_key, nonce_i, AAD="chunk:i")`
3. Wrappea `file_key` con `vault_key`
4. `POST /uploads/init` → presigned PUT URLs
5. PUT cada chunk directo a MinIO/Backblaze
6. `POST /uploads/:versionId/complete` con `content_hash`

### Compartir (con contactos)
1. Consentimiento: A solicita contacto a B (`POST /contacts`); B acepta. Al aceptar se fija (TOFU) la `exchange_public_key` de cada uno
2. `sealed_key = crypto_box_seal(file_key, contacto_pubkey)` + `sealed_meta = crypto_box_seal({name, mime}, contacto_pubkey)` (el nombre va cifrado con la `vault_key` del emisor, que el receptor no tiene)
3. `POST /shares` — solo si sois contactos aceptados
4. El receptor abre `sealed_key`/`sealed_meta` con su privkey, descarga los chunks y los descifra con la `file_key`

## Docker images

```bash
# Frontend (landing + app)
docker pull topgambajrjdeveloper/noctcom:latest

# Backend API
docker pull topgambajrjdeveloper/noctcom-api:latest
```

## Desarrollo local

```bash
# Servicios de infraestructura
docker compose up -d postgres redis minio minio-init

# Backend (puerto 3000)
cd backend && npm install && npm run dev

# Frontend (puerto 3001)
cd frontend && npm install && npm run dev
```

## Estructura del proyecto

```
noctcom/
├── backend/          # API Fastify + TypeScript
│   ├── src/routes/   # auth, uploads, nodes, storage, admin, shares...
│   ├── src/crypto/   # libsodium wrappers
│   └── src/db/       # PostgreSQL pool + Redis
├── frontend/         # Next.js 15 App Router
│   ├── app/(app)/    # Vault, settings, profile, manual...
│   ├── app/(auth)/   # Login, signup, recovery, verify
│   ├── components/   # UI components, modals, preview
│   └── lib/          # crypto, auth-store, vault-store, api
├── docker/           # PostgreSQL init SQL, Caddy config
├── scripts/          # DB migration scripts
└── docs/             # CRYPTO_SPEC, THREAT_MODEL, SECURITY
```

## Decisiones de diseno

- **XChaCha20-Poly1305** (no AES-GCM): nonces de 24 bytes sin riesgo de colision
- **Argon2id** sobre PBKDF2/scrypt: resistente a GPU/ASIC con 256 MiB
- **Chunks de 4 MiB con AAD**: previene reorder attacks, permite resume
- **Presigned URLs**: el backend no toca los blobs, escala sin estado
- **Zero-knowledge email**: solo se guarda `BLAKE2b(email)`, no el email
- **Soft delete**: papelera real con recovery hasta el purge
- **Versionado**: rollback sin recifrar

## Seguridad

Ver [SECURITY.md](SECURITY.md) para reportar vulnerabilidades.
Ver [docs/CRYPTO_SPEC.md](docs/CRYPTO_SPEC.md) para la especificacion criptografica completa.
Ver [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) para el modelo de amenazas.

## Licencia

[AGPL-3.0](LICENSE) — codigo abierto, auditable, self-hostable.
