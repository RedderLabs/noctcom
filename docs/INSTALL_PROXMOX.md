# Instalar Noctcom en Proxmox VE

Guía paso a paso para desplegar tu propia instancia de Noctcom como contenedor
**LXC** en un host Proxmox VE. Pensada para alguien que tiene Proxmox pero no
es experto en Docker: un solo comando hace todo el trabajo.

> ¿Buscas el plan de contribución a *community-scripts* o los detalles técnicos
> del LXC? Están en [`proxmox/README.md`](../proxmox/README.md). Este documento
> es el manual de usuario para instalar y mantener tu instancia.

---

## Qué hace la instalación

El script crea un **LXC Debian no privilegiado** (con `nesting` y `keyctl`
activados para que Docker funcione dentro), instala Docker y levanta el stack
completo de Noctcom con el instalador oficial (`install.sh`):

- PostgreSQL, Redis, MinIO (object storage), el backend, el frontend y Caddy
  (TLS automático) — todo dentro del LXC, aislado del host.
- **Sin dominio → modo LAN (same-origin):** la app y la API conviven en
  `http://<IP-del-LXC>` (la API bajo `/api`). Ideal para homelab / red local; la
  web usa rutas relativas, así que funciona con cualquier IP sin configurar nada.
- **Con dominio → TLS automático** con Caddy (necesita DNS apuntando al LXC y
  los puertos 80/443 accesibles).

Tus archivos se cifran en el navegador antes de salir; ni el servidor ni quien
administre el host puede leer su contenido. Self-host = **gratis e ilimitado**,
sin planes ni periodo de prueba.

---

## Requisitos

- Un host **Proxmox VE** (8.x o 9.x) con acceso **root** por SSH o por la
  consola del nodo.
- Conexión a internet desde el host (descarga la plantilla de Debian y las
  imágenes Docker).
- Recursos para el LXC: **2 vCPU · 4 GiB de RAM · 20 GB de disco** por defecto.
  > La RAM importa: el build de Next.js necesita **más de 2 GiB**. No bajes de
  > 4 GiB salvo que sepas lo que haces.
- (Opcional) Un **dominio** con un registro DNS apuntando a la IP del LXC, si
  quieres HTTPS automático en lugar del modo LAN.

---

## Instalación en un comando

Abre una shell **como root en el host Proxmox VE** (no dentro de una VM ni de
otro contenedor) y ejecuta:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
```

El script:

1. Comprueba que estás en un host Proxmox (`pct`, `pveam`, `pvesh`).
2. Te pregunta el **dominio** (déjalo vacío para modo LAN por IP).
3. Descarga la plantilla Debian, crea el LXC, instala Docker dentro y arranca
   Noctcom.
4. Al terminar te muestra la **URL** de acceso y el **ID del contenedor (CTID)**.

Cuando acabe, abre esa URL en el navegador y **crea tu cuenta**. La primera
cuenta del servidor es la de administrador.

> Guarda bien tu **frase de recuperación de 12 palabras** durante el registro:
> es la única forma de recuperar la cuenta y los archivos si olvidas la
> contraseña. Nadie —tampoco tú como admin— puede recuperarla por ti.

---

## Personalizar la instalación

Pasa variables de entorno antes del comando para ajustar recursos o red. Por
ejemplo, un LXC con más RAM y un dominio propio:

```bash
NOCTCOM_RAM=6144 NOCTCOM_DOMAIN=noctcom.midominio.com NOCTCOM_EMAIL=tu@correo.com \
  bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
```

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `NOCTCOM_CTID` | siguiente libre | ID del contenedor LXC |
| `NOCTCOM_HOSTNAME` | `noctcom` | hostname del LXC |
| `NOCTCOM_CORES` | `2` | vCPUs |
| `NOCTCOM_RAM` | `4096` | MiB de RAM (el build de Next.js pide >2 GiB) |
| `NOCTCOM_DISK` | `20` | GB de disco del rootfs |
| `NOCTCOM_STORAGE` | `local-lvm` | storage del rootfs |
| `NOCTCOM_TEMPLATE_STORAGE` | `local` | storage de plantillas (vztmpl) |
| `NOCTCOM_BRIDGE` | `vmbr0` | bridge de red |
| `NOCTCOM_DOMAIN` | *(vacío)* | dominio; vacío = modo LAN por IP |
| `NOCTCOM_EMAIL` | — | email para los certificados TLS (con dominio) |
| `NOCTCOM_NONINTERACTIVE` | `0` | `1` = no preguntar nada (usa los valores por defecto) |

> **Consejo (modo LAN):** la URL de la API queda integrada en el build del
> frontend, así que conviene **reservar la IP del LXC en tu DHCP** (o asignarla
> fija) para que no cambie tras un reinicio.

---

## Acceder y usar

- **Modo LAN:** `http://<IP-del-LXC>` (same-origin: la API responde bajo `/api`).
- **Con dominio:** `https://app.tu-dominio.com` (Caddy emite el certificado solo).

Desde ahí ya tienes todo: subir y previsualizar archivos, carpetas, papelera,
**contactos y compartir cifrado de extremo a extremo**, 2FA, multidispositivo,
discos externos (vía el agente *Noctcom Connector*) y el manual integrado.

---

## Mantenimiento

**Actualizar** a la última versión — un solo comando hace `git pull`, reconcilia
el `.env` (aplica migraciones) y reconstruye, sin reinstalar ni tocar tus secretos:

```bash
pct exec <CTID> -- bash -lc 'cd /opt/noctcom && bash update.sh'
```

**Ver el estado** de los servicios:

```bash
pct exec <CTID> -- bash -lc 'cd /opt/noctcom && docker compose ps'
```

**Logs** del backend o el frontend:

```bash
pct exec <CTID> -- bash -lc 'cd /opt/noctcom && docker compose logs -f backend'
```

**Copias de seguridad:** además de respaldar el LXC desde Proxmox (Backup), ten
en cuenta los volúmenes de PostgreSQL y MinIO dentro del contenedor. La guía de
restauración verificada está en [`docs/RESTORE.md`](RESTORE.md).

---

## Problemas frecuentes

- **«No encuentro `pct`/`pveam`/`pvesh`»** — estás ejecutando el script dentro
  de una VM o LXC, no en el host. Conéctate al **nodo Proxmox** como root.
- **El build se queda sin memoria / se mata** — sube `NOCTCOM_RAM` (mínimo
  recomendado 4096; Next.js necesita >2 GiB para compilar).
- **No carga con dominio** — revisa que el DNS apunte a la IP correcta y que los
  puertos **80 y 443** lleguen al LXC (NAT/port-forward en tu router/firewall).
- **La IP del LXC cambió y la app no conecta con la API (modo LAN)** — reserva
  la IP en el DHCP y reinstala, o reconstruye el frontend con la IP nueva.

---

## Otras formas de instalar

- **Cualquier host con Docker** (no solo Proxmox): el instalador en un comando de
  la raíz del repo —ver [`README.md`](../README.md) y [`SELFHOST.md`](../SELFHOST.md).
- **Catálogo community-scripts** (cuando el proyecto madure): plan y borradores
  en [`proxmox/README.md`](../proxmox/README.md).
