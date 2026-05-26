# Self-hosting Noctcom

## Requirements

- Docker Engine 24+ with Compose V2
- A domain with DNS pointing to your server (A record)
- At least 2 GB RAM / 1 vCPU
- Ports 80 and 443 open

## Quick start

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
| `USER_QUOTA_BYTES` | 10 GB | Storage per user |

## Updates

```bash
git pull
docker compose build
docker compose up -d
```

## Backups

Back up these Docker volumes:

- `noctcom_postgres_data` — database
- `noctcom_minio_data` — encrypted file blobs
- `noctcom_redis_data` — sessions (optional, regenerated on login)

```bash
# Example: backup PostgreSQL
docker exec noctcom-postgres pg_dump -U noctcom noctcom > backup.sql
```

## Security notes

- All file content is encrypted client-side before upload (XChaCha20-Poly1305)
- The server never sees plaintext file content, names, or metadata
- Vault keys are derived from the user's password — the server cannot decrypt anything
- TLS is enforced by Caddy with HSTS preload
- Rate limiting is Redis-backed for distributed deployments
