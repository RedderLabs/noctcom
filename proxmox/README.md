# Noctcom en Proxmox VE

Dos rutas para desplegar Noctcom como contenedor LXC en Proxmox. Ambas crean
un LXC Debian **no privilegiado** con nesting, instalan Docker dentro y
levantan el stack con el instalador oficial (`install.sh` de la raíz del repo).

## Ruta 1 — Script propio (disponible ya)

Ejecutar **como root en el host Proxmox VE**:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
```

- Sin dominio → **modo LAN**: app en `http://<IP-del-LXC>`, API en `:3000`.
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
4. Los revisores pueden pedir que la instalación sea explícita en lugar de
   delegar en nuestro `install.sh`; en ese caso, inlinear los pasos
   (clonar repo, generar `.env`, `docker compose up`).

### Checklist de madurez antes del PR

- [ ] Versión estable etiquetada (≥ 1.0 o equivalente) y releases regulares
- [ ] Probado el `ct/noctcom.sh` en un host Proxmox VE real (instalación + update)
- [ ] Web y docs públicas estables (noctcom.com, README del repo)
- [ ] `json/noctcom.json`: revisar categorías (11 = Files & Downloads,
      6 = Authentication & Security) y que el logo cargue bien en su web
- [ ] Comunidad mínima activa (issues atendidas) — los maintainers valoran
      que el proyecto esté mantenido

## Notas técnicas

- Docker dentro de LXC no privilegiado requiere `--features nesting=1,keyctl=1`
  (ambas rutas lo configuran).
- El modo LAN lo implementa `install.sh` + `docker-compose.lan.yml` +
  `docker/caddy/Caddyfile.lan` (raíz del repo): Caddy en HTTP plano, app `:80`
  y API `:3000`. La URL de la API queda integrada en el build del frontend →
  conviene reservar la IP del LXC en el DHCP.
- `COMPOSE_FILE` en `/opt/noctcom/.env` selecciona los ficheros compose
  correctos (y evita el `docker-compose.override.yml` de desarrollo).
