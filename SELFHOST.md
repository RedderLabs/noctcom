# Self-hosting Noctcom

## Requirements

- **A Linux box with internet access.** The one-command installer **installs
  Docker for you if it's missing** (any distro with apt/dnf/yum/apk/pacman); the
  manual path below needs Docker Engine 24+ with Compose V2.
- **4 GB RAM recommended** (Next.js build needs > 2 GiB; Argon2id uses 256 MiB at
  runtime) / 1 vCPU.
- Optional: a domain with DNS pointing to your server (A record) for automatic
  TLS. Without a domain it runs in LAN mode at `https://<IP>` with an internal
  (self-signed) certificate.
- Ports 80 and 443 open (domain mode).

## Quickest: one command (recommended)

Installs Docker if needed, asks for your domain (leave empty for LAN mode),
generates secrets and brings the whole stack up:

```bash
curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/install.sh | bash
```

On **Proxmox VE** (creates a Debian LXC, installs Docker inside, deploys), run as
root on the PVE host:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
```

Prefer to control every step? The manual quick start follows.

## Quick start (manual)

### 1. Clone and configure

```bash
git clone https://github.com/RedderLabs/noctcom.git
cd noctcom
cp .env.example .env
```

### 2. Generate secrets

Replace all placeholder values in `.env`:

```bash
# Generate secure passwords
openssl rand -base64 32   # for POSTGRES_PASSWORD
openssl rand -base64 32   # for MINIO_ROOT_PASSWORD
openssl rand -base64 32   # for REDIS_PASSWORD
openssl rand -base64 64   # for JWT_SECRET
```

### 3. Configure your domain

Edit `.env` and set your domain:

```
PUBLIC_URL=https://api.your-domain.com
PUBLIC_API_URL=https://api.your-domain.com
FRONTEND_URL=https://app.your-domain.com
CADDY_DOMAIN=your-domain.com
CADDY_EMAIL=admin@your-domain.com
MINIO_CONSOLE_URL=https://minio.your-domain.com
```

### 4. Configure SMTP

Set your email provider credentials in `.env`:

```
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=465
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@your-domain.com
```

### 5. Launch

```bash
docker compose up -d
```

Caddy automatically provisions TLS certificates via Let's Encrypt.

### 6. Verify

```bash
curl https://api.your-domain.com/health
# Expected: {"status":"ok","db":true,"redis":true,"s3":true,"ts":...}
```

Open `https://app.your-domain.com` and create your first account.

## Architecture

```
                    ┌─────────┐
         :80/:443   │  Caddy  │  TLS + reverse proxy
                    └────┬────┘
                ┌────────┼────────┐
                ▼                 ▼
         ┌──────────┐     ┌──────────┐
         │ Frontend  │     │ Backend  │
         │ Next.js   │     │ Fastify  │
         └──────────┘     └────┬─────┘
                          ┌────┼────┐
                          ▼    ▼    ▼
                     ┌────┐ ┌────┐ ┌────┐
                     │ PG │ │Redis│ │MinIO│
                     └────┘ └────┘ └────┘
```

- **PostgreSQL**: metadata (all sensitive strings encrypted)
- **Redis**: sessions, rate limiting, real-time pub/sub
- **MinIO**: encrypted file blobs (S3-compatible)
- **Caddy**: automatic TLS, security headers, HTTP/2+3

## Subdomains

| Subdomain | Service |
|-----------|---------|
| `app.your-domain.com` | Frontend (web app) |
| `api.your-domain.com` | Backend API |
| `minio.your-domain.com` | MinIO console (admin) |

## Quotas

Default quotas in `.env`:

| Setting | Default | Description |
|---------|---------|-------------|
| `MAX_UPLOAD_BYTES` | 5 GB | Maximum single file size |
| `USER_QUOTA_BYTES` | 1 GB | Storage per user |

## Updates

From the install folder, one command pulls the latest changes, reconciles your
`.env` (applying any migrations) and rebuilds — without reinstalling or touching
your secrets:

```bash
bash update.sh
```

## Backups

One command makes a **time-consistent, restorable** copy of the database
(`postgres_data`) and the encrypted blobs (`minio_data`, `blob_data`, plus any
`EXTRA_DATA_DIR` disks) as a single timestamped `.tar.gz` in `./backups/`:

```bash
bash scripts/backup.sh
```

Restore it (DESTRUCTIVE — prompts you to type RESTAURAR):

```bash
bash scripts/restore.sh backups/noctcom-backup-YYYYMMDD-HHMMSS.tar.gz
```

- Keeps the last 7 copies (`NOCTCOM_BACKUP_KEEP`); destination via `NOCTCOM_BACKUP_DIR`.
- **Store copies off the server** (another disk/host). They're user-encrypted, but
  treat them as sensitive anyway.
- Automate daily with cron:
  `15 3 * * * cd /path/to/noctcom && bash scripts/backup.sh >> /var/log/noctcom-backup.log 2>&1`
- DB and blobs come from the same backup, so they stay consistent with each other.
- Full restore/verification guide: [`docs/RESTORE.md`](docs/RESTORE.md).

> A backup you've never restored isn't a backup — test a restore now and then.

## Security notes

- All file content is encrypted client-side before upload (XChaCha20-Poly1305)
- The server never sees plaintext file content, names, or metadata
- Vault keys are derived from the user's password — the server cannot decrypt anything
- TLS is enforced by Caddy with HSTS preload
- Rate limiting is Redis-backed for distributed deployments
