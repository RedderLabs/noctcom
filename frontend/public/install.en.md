# Install Noctcom on your server

Noctcom is **100% open source (AGPL-3.0)** and self-hosting is **free forever**, with no plans or limits. You bring the hardware; the encryption is the same as the managed cloud: everything is encrypted in the browser and the server only ever stores ciphertext.

Pick whichever fits you:

- **Docker** on any Linux server or your own machine (fastest).
- **Proxmox VE** as an LXC container (one command on the host).
- **By hand**, controlling every step.

---

## Requirements

- **Docker** and **Docker Compose v2** (except the Proxmox route, which installs Docker for you).
- **2 GB of RAM** minimum (Argon2id uses 256 MiB; the frontend build needs >2 GiB — 4 GB recommended).
- Optional: a **domain** with DNS pointing to the server for automatic TLS. Without a domain, it runs in **LAN mode** by IP (no TLS), ideal for a homelab.

---

## Option 1 — Docker on a server or your PC (recommended)

Works on a **remote server** (a VPS, a home server) or on **localhost**. A single command downloads the installer, asks for your domain, generates the secrets and brings everything up (PostgreSQL, Redis, MinIO, backend, frontend and Caddy with automatic TLS):

```bash
curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/install.sh | bash
```

- **With a domain:** automatic TLS (Let's Encrypt via Caddy). Point `app.your-domain.com` and `api.your-domain.com` to the server's IP.
- **Without a domain → LAN mode:** the app on `http://<IP>` and the API on `http://<IP>:3000`, visible on your network. Reserve the IP in your DHCP: the API URL is baked into the frontend build.

When it finishes, open the URL and **create your account** (the first one is the administrator).

> Keep your **12-word recovery phrase** safe during sign-up: it's the only way to recover your account and files if you forget your password. It's zero-knowledge — nobody can recover it for you.

---

## Option 2 — Proxmox VE (LXC container)

Run this **as root on the Proxmox VE host** (not inside a VM/LXC). It creates an unprivileged Debian LXC, installs Docker inside and brings Noctcom up:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
```

Configurable via variables (`NOCTCOM_RAM`, `NOCTCOM_DISK`, `NOCTCOM_DOMAIN`…). The full step-by-step manual, with the variable table and troubleshooting, lives in the repo: [docs/INSTALL_PROXMOX.md](https://github.com/RedderLabs/noctcom/blob/main/docs/INSTALL_PROXMOX.md).

---

## Option 3 — By hand (Docker Compose)

If you'd rather control each step:

```bash
git clone https://github.com/RedderLabs/noctcom.git
cd noctcom
cp .env.example .env
# Edit .env: change CADDY_DOMAIN, all passwords and JWT_SECRET
docker compose up -d
```

This brings up PostgreSQL, Redis, MinIO, backend, frontend and Caddy (automatic TLS). Your instance will live at `https://app.your-domain.com`.

---

## On a managed PaaS (Render, Railway…)?

It's possible, but it's an **advanced** route: on a PaaS you don't run the full `docker-compose`, you build and deploy the repo's **images** (`<your-username>/noctcom` and `<your-username>/noctcom-api`) and supply the managed services yourself —PostgreSQL, Redis and S3-compatible storage (e.g. Backblaze B2)— with their environment variables. For most people, a server with Docker (Option 1) is simpler and cheaper. If you still want that path, start from the repo's [docker-compose.yml](https://github.com/RedderLabs/noctcom/blob/main/docker-compose.yml) and [self-hosting guide](https://github.com/RedderLabs/noctcom/blob/main/SELFHOST.md).

---

## After installing

- **Update:** from the project folder, `git pull && docker compose up -d --build`. On Proxmox: `pct exec <CTID> -- bash -lc 'cd /opt/noctcom && git pull && docker compose up -d --build'`.
- **Email (verification/OTP):** disabled by default. Add `RESEND_API_KEY` or the `SMTP_*` variables to `.env`.
- **Backups:** back up the PostgreSQL and MinIO volumes. Verified restore guide: [docs/RESTORE.md](https://github.com/RedderLabs/noctcom/blob/main/docs/RESTORE.md).

Questions or something not adding up? Development is in the open: [github.com/RedderLabs/noctcom](https://github.com/RedderLabs/noctcom).
