# Instalar Noctcom en tu servidor

Noctcom es **100% open source (AGPL-3.0)** y self-host **gratis para siempre**, sin planes ni límites. Tú pones el hardware; el cifrado es el mismo que en la nube gestionada: todo se cifra en el navegador y el servidor solo guarda texto cifrado.

Elige la vía que más te encaje:

- **Docker** en cualquier servidor Linux o en tu propio ordenador (lo más rápido).
- **Proxmox VE** como contenedor LXC (un comando en el host).
- **A mano**, controlando cada paso.

---

## Requisitos

- **Docker** y **Docker Compose v2** (salvo la vía Proxmox, que instala Docker por ti).
- **2 GB de RAM** como mínimo (Argon2id usa 256 MiB; el build del frontend necesita >2 GiB — recomendado 4 GB).
- Opcional: un **dominio** con DNS apuntando al servidor para TLS automático. Sin dominio, funciona en **modo LAN** por IP (sin TLS), ideal para homelab.

---

## Opción 1 — Docker en un servidor o en tu PC (recomendada)

Sirve para un **servidor remoto** (un VPS, un servidor en casa) o para **localhost**. Un solo comando descarga el instalador, te pregunta el dominio, genera los secretos y levanta todo (PostgreSQL, Redis, MinIO, backend, frontend y Caddy con TLS automático):

```bash
curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/install.sh | bash
```

- **Con dominio:** TLS automático (Let's Encrypt vía Caddy). Apunta `app.tu-dominio.com` y `api.tu-dominio.com` a la IP del servidor.
- **Sin dominio → modo LAN:** la app en `http://<IP>` y la API en `http://<IP>:3000`, visibles en tu red. Reserva la IP en tu DHCP: la URL de la API se hornea en el build del frontend.

Cuando termine, abre la URL y **crea tu cuenta** (la primera es la de administrador).

> Guarda bien tu **frase de recuperación de 12 palabras** durante el registro: es la única forma de recuperar la cuenta y los archivos si olvidas la contraseña. Es zero-knowledge: nadie puede recuperarla por ti.

---

## Opción 2 — Proxmox VE (contenedor LXC)

Ejecuta esto **como root en el host Proxmox VE** (no dentro de una VM/LXC). Crea un LXC Debian no privilegiado, instala Docker dentro y levanta Noctcom:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
```

Configurable por variables (`NOCTCOM_RAM`, `NOCTCOM_DISK`, `NOCTCOM_DOMAIN`…). El manual completo paso a paso, con la tabla de variables y la resolución de problemas, está en el repositorio: [docs/INSTALL_PROXMOX.md](https://github.com/RedderLabs/noctcom/blob/main/docs/INSTALL_PROXMOX.md).

---

## Opción 3 — A mano (Docker Compose)

Si prefieres controlar cada paso:

```bash
git clone https://github.com/RedderLabs/noctcom.git
cd noctcom
cp .env.example .env
# Edita .env: cambia CADDY_DOMAIN, todas las contraseñas y JWT_SECRET
docker compose up -d
```

Esto levanta PostgreSQL, Redis, MinIO, backend, frontend y Caddy (TLS automático). Tu instancia quedará en `https://app.tu-dominio.com`.

---

## ¿En un PaaS gestionado (tipo Render, Railway…)?

Es posible, pero es una vía **avanzada**: en un PaaS no corres el `docker-compose` completo, sino que despliegas las **imágenes** (`topgambajrjdeveloper/noctcom` y `noctcom-api`) y aportas tú los servicios gestionados —PostgreSQL, Redis y un almacenamiento S3 (p. ej. Backblaze B2)— con sus variables de entorno. Para la mayoría de la gente, un servidor con Docker (Opción 1) es más sencillo y barato. Si aun así quieres ese camino, parte del [docker-compose.yml](https://github.com/RedderLabs/noctcom/blob/main/docker-compose.yml) y la guía de [self-hosting](https://github.com/RedderLabs/noctcom/blob/main/SELFHOST.md) del repositorio.

---

## Después de instalar

- **Actualizar:** desde la carpeta del proyecto, `git pull && docker compose up -d --build`. En Proxmox: `pct exec <CTID> -- bash -lc 'cd /opt/noctcom && git pull && docker compose up -d --build'`.
- **Email (verificación/OTP):** desactivado por defecto. Añade `RESEND_API_KEY` o las variables `SMTP_*` en `.env`.
- **Copias de seguridad:** respalda los volúmenes de PostgreSQL y MinIO. Guía de restauración verificada: [docs/RESTORE.md](https://github.com/RedderLabs/noctcom/blob/main/docs/RESTORE.md).

¿Dudas o algo que no encaja? El desarrollo está en abierto: [github.com/RedderLabs/noctcom](https://github.com/RedderLabs/noctcom).
