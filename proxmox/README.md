# Noctcom en Proxmox VE

> **¿Solo quieres instalarlo?** El manual de usuario paso a paso está en
> [`docs/INSTALL_PROXMOX.md`](../docs/INSTALL_PROXMOX.md). Este documento cubre
> el detalle técnico del LXC y el plan de contribución a *community-scripts*.

Dos rutas para desplegar Noctcom como contenedor LXC en Proxmox. Ambas crean
un LXC Debian **no privilegiado** con nesting, instalan Docker dentro y
levantan el stack con el instalador oficial (`install.sh` de la raíz del repo).

## Ruta 1 — Script propio (disponible ya)

Ejecutar **como root en el host Proxmox VE**:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
```

- Sin dominio → **modo LAN** (same-origin): app y API en `https://<IP-del-LXC>` (la API bajo `/api`) con **HTTPS interno** (certificado autofirmado).
- Con dominio (`NOCTCOM_DOMAIN=example.com`) → TLS automático con Caddy.
- Configurable por variables de entorno (`NOCTCOM_CTID`, `NOCTCOM_RAM`,
  `NOCTCOM_DISK`, `NOCTCOM_STORAGE`, `NOCTCOM_BRIDGE`…); ver cabecera del script.
- Recursos por defecto: 2 vCPU · 4 GiB RAM · 20 GB disco · Debian 13.

Actualizar una instalación:

```bash
pct exec <CTID> -- bash -lc 'cd /opt/noctcom && git pull && docker compose up -d --build'
```

## Ruta 2 — PR a community-scripts (cuando el proyecto esté maduro)

`community-scripts/` contiene el borrador listo para contribuir al catálogo de
[community-scripts.org](https://community-scripts.org/scripts):

```
community-scripts/
├── ct/noctcom.sh               # creación del LXC + update_script()
├── install/noctcom-install.sh  # instalación dentro del LXC
└── json/noctcom.json           # metadatos para la web del catálogo
```

### Proceso de contribución (importante)

1. Los scripts **nuevos** se envían a [ProxmoxVED](https://github.com/community-scripts/ProxmoxVED)
   (repo de pruebas), **no** a ProxmoxVE — los PRs directos a ProxmoxVE se
   cierran sin revisión. Tras aceptarse y verificarse, los maintainers lo
   promocionan a ProxmoxVE.
2. Fork de ProxmoxVED → rama `feat/noctcom` → copiar los tres ficheros a
   `ct/`, `install/` y `json/` → probar en un Proxmox real → abrir el PR.
3. Estándares de código: <https://community-scripts.org/docs/contribution>
   (shellcheck limpio, formato de los `msg_info/msg_ok`, etc.).
4. La instalación es **explícita** (no delega en `install.sh`): `install/noctcom-install.sh`
   ya inlinea los pasos —clonar el repo, generar `.env` con secretos, `docker compose up`—
   replicando el modo LAN del instalador oficial, como esperan los revisores.
   En ProxmoxVED los tres ficheros van en `ct/`, `install/` y **`json/`** (raíz).
   Plantillas oficiales: `.github/CONTRIBUTOR_AND_GUIDES/ct/AppName.sh` y `install/AppName-install.sh`.

### Requisitos OBLIGATORIOS de aplicación (de la plantilla de PR de ProxmoxVED)

La sección "Application Requirements" del PR la valida un check **automático**; si no
se cumple, el PR **se cierra sin revisión**. NO depende de la versión (no exigen 1.0):

- [ ] La aplicación tiene **al menos 6 meses de antigüedad** — ❌ Noctcom es de mayo 2026
- [ ] **Mantenida activamente** — ✅
- [ ] **600+ estrellas en GitHub** — ❌ (proyecto nuevo)
- [ ] Publica **tarballs de release oficiales** — ✅ (GitHub Releases: v0.17.0)
- [ ] Entender que no todos los scripts se aceptan

> **Conclusión:** hoy Noctcom NO cumple (antigüedad + estrellas). Enviarlo ahora =
> cierre automático. Los 3 ficheros quedan listos; se envía cuando el repo supere
> **6 meses y 600 estrellas**. Mientras tanto, `noctcom-lxc.sh` ya da a los usuarios
> la instalación en Proxmox sin pasar por el catálogo.

### Cómo enviarlo (cuando se cumplan los requisitos)

1. Fork de ProxmoxVED y clónalo; corre su `docs/contribution/setup-fork.sh` (reescribe
   las URLs raw de `build.func`/`install.func` para que apunten a tu fork al probar).
2. Copia los 3 ficheros a `ct/noctcom.sh`, `install/noctcom-install.sh`, `json/noctcom.json`.
3. **Prueba en un Proxmox VE real** desde tu fork: `bash -c "$(curl -fsSL .../<user>/<repo>/refs/heads/<rama>/ct/noctcom.sh)"` (instalación + update).
4. `shellcheck` limpio en los dos `.sh`.
5. Abre el PR contra ProxmoxVED, marca "🆕 New script" y rellena la sección de requisitos.

## Notas técnicas

- Docker dentro de LXC no privilegiado requiere `--features nesting=1,keyctl=1`
  (ambas rutas lo configuran).
- El modo LAN lo implementa `install.sh` + `docker-compose.lan.yml` +
  `docker/caddy/Caddyfile.lan` (raíz del repo): Caddy con **HTTPS interno** (`tls
  internal`, cert autofirmado por IP), same-origin en `:443` — la app y la API
  (bajo `/api`) comparten origen, así que el frontend usa rutas relativas y no
  hornea la IP para el login. `PUBLIC_URL` (subidas de chunks) sí lleva la IP →
  conviene reservar la IP del LXC en el DHCP (`install.sh` avisa si cambia).
- `COMPOSE_FILE` en `/opt/noctcom/.env` selecciona los ficheros compose
  correctos (y evita el `docker-compose.override.yml` de desarrollo).
