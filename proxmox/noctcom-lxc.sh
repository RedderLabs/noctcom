#!/usr/bin/env bash
#
# Noctcom — Proxmox VE LXC installer (standalone)
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
#
# Ejecutar COMO ROOT EN EL HOST Proxmox VE (no dentro de una VM/LXC).
# Crea un LXC Debian no privilegiado con nesting (Docker dentro), instala
# Docker y levanta Noctcom con el instalador oficial (install.sh).
#   · Sin dominio → modo LAN: app en http://<IP-del-LXC>, API en :3000.
#   · Con dominio → TLS automático (requiere DNS apuntando al LXC y 80/443).
#
# Variables de entorno opcionales:
#   NOCTCOM_CTID=120            ID del contenedor (por defecto: siguiente libre)
#   NOCTCOM_HOSTNAME=noctcom    hostname del LXC
#   NOCTCOM_CORES=2             vCPUs
#   NOCTCOM_RAM=4096            MiB de RAM (el build de Next.js necesita >2 GiB)
#   NOCTCOM_DISK=20             GB de disco
#   NOCTCOM_STORAGE=local-lvm   storage del rootfs
#   NOCTCOM_TEMPLATE_STORAGE=local   storage de plantillas (vztmpl)
#   NOCTCOM_BRIDGE=vmbr0        bridge de red
#   NOCTCOM_DOMAIN=example.com  dominio (vacío = modo LAN por IP)
#   NOCTCOM_EMAIL=you@mail.com  email para certificados TLS (con dominio)
#   NOCTCOM_NONINTERACTIVE=1    no preguntar nada
set -euo pipefail

# ─── Colores ────────────────────────────────────────────────────
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; V=$'\033[35m'; N=$'\033[0m'
else
  B=""; DIM=""; G=""; Y=""; R=""; V=""; N=""
fi
say()  { printf "%s\n" "$*"; }
ok()   { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}!${N} %s\n" "$*"; }
die()  { printf "${R}✗ %s${N}\n" "$*" >&2; exit 1; }
hr()   { printf "${DIM}────────────────────────────────────────────────────────${N}\n"; }

ask() { # ask <prompt> <default> <var>  (lee de /dev/tty aunque venga por tubería)
  local prompt="$1" default="$2" __var="$3" reply=""
  if [ "${NOCTCOM_NONINTERACTIVE:-0}" = "1" ] || [ ! -e /dev/tty ]; then
    printf -v "$__var" '%s' "$default"; return
  fi
  printf "${B}%s${N}${DIM}%s${N} " "$prompt" "${default:+ [$default]}" > /dev/tty
  read -r reply < /dev/tty || true
  printf -v "$__var" '%s' "${reply:-$default}"
}

printf "\n${V}${B}  Noctcom${N} ${DIM}· Proxmox VE LXC installer${N}\n"
printf "${DIM}  Zero-knowledge encrypted storage · AGPL-3.0${N}\n\n"

# ─── 1. Requisitos (host Proxmox) ───────────────────────────────
say "${B}1. Comprobando el host Proxmox…${N}"
command -v pct    >/dev/null 2>&1 || die "No encuentro 'pct'. Este script se ejecuta EN EL HOST Proxmox VE."
command -v pveam  >/dev/null 2>&1 || die "No encuentro 'pveam'. Este script se ejecuta EN EL HOST Proxmox VE."
command -v pvesh  >/dev/null 2>&1 || die "No encuentro 'pvesh'. Este script se ejecuta EN EL HOST Proxmox VE."
[ "$(id -u)" = "0" ] || die "Ejecútalo como root en el host Proxmox."
ok "Host Proxmox VE detectado ($(pveversion 2>/dev/null || echo 'pveversion no disponible'))"

CTID="${NOCTCOM_CTID:-$(pvesh get /cluster/nextid)}"
HOSTNAME="${NOCTCOM_HOSTNAME:-noctcom}"
CORES="${NOCTCOM_CORES:-2}"
RAM="${NOCTCOM_RAM:-4096}"
DISK="${NOCTCOM_DISK:-20}"
STORAGE="${NOCTCOM_STORAGE:-local-lvm}"
TPL_STORAGE="${NOCTCOM_TEMPLATE_STORAGE:-local}"
BRIDGE="${NOCTCOM_BRIDGE:-vmbr0}"

DOMAIN="${NOCTCOM_DOMAIN:-}"
[ -z "$DOMAIN" ] && ask "   Dominio (vacío = modo LAN por IP, sin TLS):" "" DOMAIN
EMAIL="${NOCTCOM_EMAIL:-}"
[ -z "$EMAIL" ] && [ -n "$DOMAIN" ] && ask "   Email para los certificados TLS:" "admin@$DOMAIN" EMAIL

say "${DIM}   LXC #$CTID · $CORES vCPU · ${RAM}MiB RAM · ${DISK}GB ($STORAGE) · $BRIDGE${N}"

# ─── 2. Plantilla Debian ────────────────────────────────────────
say ""
say "${B}2. Plantilla Debian 13…${N}"
pveam update >/dev/null 2>&1 || true
# '|| true': con pipefail, un grep sin resultados mataría el script sin mensaje.
TEMPLATE="$(pveam available --section system 2>/dev/null | awk '{print $2}' | grep -E '^debian-13-standard' | sort -V | tail -1 || true)"
[ -n "$TEMPLATE" ] || die "No encuentro la plantilla debian-13-standard ('pveam available')."
if pveam list "$TPL_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  ok "Plantilla ya descargada: $TEMPLATE"
else
  say "   Descargando $TEMPLATE…"
  pveam download "$TPL_STORAGE" "$TEMPLATE" >/dev/null
  ok "Plantilla descargada en '$TPL_STORAGE'"
fi

# ─── 3. Crear el LXC ────────────────────────────────────────────
say ""
say "${B}3. Creando el LXC #$CTID…${N}"
pct status "$CTID" >/dev/null 2>&1 && die "Ya existe un contenedor con ID $CTID. Usa NOCTCOM_CTID=<otro>."
pct create "$CTID" "$TPL_STORAGE:vztmpl/$TEMPLATE" \
  --hostname "$HOSTNAME" \
  --cores "$CORES" --memory "$RAM" --swap 512 \
  --rootfs "$STORAGE:$DISK" \
  --net0 "name=eth0,bridge=$BRIDGE,ip=dhcp" \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --onboot 1 \
  --tags noctcom \
  --start 1 >/dev/null
ok "LXC creado y arrancado (no privilegiado, nesting para Docker)"

# Espera a que el contenedor tenga red (DHCP).
say "   Esperando IP por DHCP…"
IP=""
for _ in $(seq 1 30); do
  IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')" || true
  [ -n "$IP" ] && break
  sleep 2
done
[ -n "$IP" ] || die "El contenedor no obtuvo IP. ¿Hay DHCP en el bridge $BRIDGE?"
ok "IP del contenedor: $IP"

# ─── 4. Docker + Noctcom dentro del LXC ─────────────────────────
say ""
say "${B}4. Instalando Docker en el LXC…${N}"
pct exec "$CTID" -- bash -c "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -yqq curl git openssl ca-certificates >/dev/null"
pct exec "$CTID" -- bash -c "curl -fsSL https://get.docker.com | sh >/dev/null 2>&1"
pct exec "$CTID" -- docker --version >/dev/null 2>&1 || die "Docker no quedó operativo dentro del LXC."
ok "Docker instalado dentro del LXC"

say ""
say "${B}5. Instalando Noctcom (la primera vez tarda unos minutos)…${N}"
pct exec "$CTID" -- env \
  NOCTCOM_DIR=/opt/noctcom \
  NOCTCOM_NONINTERACTIVE=1 \
  NOCTCOM_DOMAIN="$DOMAIN" \
  NOCTCOM_EMAIL="$EMAIL" \
  bash -c "curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/install.sh | bash"

# ─── Resumen ────────────────────────────────────────────────────
say ""
hr
printf "${G}${B}  ¡Noctcom está instalado en el LXC #$CTID!${N}\n"
hr
if [ -n "$DOMAIN" ]; then
  say "  App:  ${B}https://app.$DOMAIN${N}"
  say "  API:  ${B}https://api.$DOMAIN${N}"
  say ""
  say "  ${Y}Apunta los DNS (registros A) app.$DOMAIN y api.$DOMAIN → $IP${N}"
  say "  ${DIM}(y redirige 80/443 del router al LXC si está tras NAT)${N}"
else
  say "  App:  ${B}http://$IP${N}    API: ${B}http://$IP:3000${N}"
  say ""
  say "  ${Y}Recomendado: reserva esta IP en tu DHCP.${N} La URL de la API va"
  say "  ${DIM}integrada en el build del frontend; si la IP cambia, edita las URLs"
  say "  en /opt/noctcom/.env y relanza: docker compose up -d --build${N}"
fi
say ""
say "  Entrar al LXC:  ${B}pct enter $CTID${N}"
say "  Ver logs:       ${B}pct exec $CTID -- bash -lc 'cd /opt/noctcom && docker compose logs -f'${N}"
say "  Actualizar:     ${B}pct exec $CTID -- bash -lc 'cd /opt/noctcom && git pull && docker compose up -d --build'${N}"
say ""
say "  ${DIM}Self-host gratis para siempre · AGPL-3.0 · https://noctcom.com${N}"
say ""
