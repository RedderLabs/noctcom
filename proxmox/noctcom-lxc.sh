#!/usr/bin/env bash
#
# Noctcom — Proxmox VE LXC installer (standalone)
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
#
# Ejecutar COMO ROOT EN EL HOST Proxmox VE (no dentro de una VM/LXC).
# Crea un LXC Debian no privilegiado con nesting (Docker dentro), instala
# Docker y levanta Noctcom con el instalador oficial (install.sh).
#   · Sin dominio → modo LAN: app y API en https://<IP-del-LXC> con HTTPS interno (cert autofirmado).
#   · Con dominio → TLS automático (requiere DNS apuntando al LXC y 80/443).
#
# Asistente TUI (whiptail) si hay terminal; si no, usa valores por defecto/env.
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
#   NOCTCOM_NET=dhcp|static     modo de red (por defecto dhcp)
#   NOCTCOM_IP=192.168.1.50/24  IP con CIDR (si NET=static)
#   NOCTCOM_GATEWAY=192.168.1.1 puerta de enlace (si NET=static)
#   NOCTCOM_DOMAIN=example.com  dominio (vacío = modo LAN por IP)
#   NOCTCOM_EMAIL=you@mail.com  email para certificados TLS (con dominio)
#   NOCTCOM_REF=main            rama/tag del repo a instalar (por defecto main)
#   NOCTCOM_NONINTERACTIVE=1    no preguntar nada (usa defaults/env, sin TUI)
set -euo pipefail

# ─── Marca y color ──────────────────────────────────────────────
# Paleta "noche" (ver «Noctcom installer visual.md» §2.1). Solo se activa en
# TTY y si NO_COLOR no está definido. El color siempre acompaña a un símbolo
# (✓ • ⚠ ✗), nunca es el único portador de significado (§7 accesibilidad).
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\033[1m'; DIM=$'\033[2m'
  AC=$'\033[38;5;44m'    # acento teal (marca)
  G=$'\033[1;92m'        # ok
  Y=$'\033[33m'          # info
  O=$'\033[38;5;214m'    # aviso
  R=$'\033[01;31m'       # error
  V="$AC"; N=$'\033[0m'
else
  B=""; DIM=""; AC=""; G=""; Y=""; O=""; R=""; V=""; N=""
fi
say()  { printf "%s\n" "$*"; }
info() { printf "${Y}•${N} %s\n" "$*"; }
ok()   { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${O}⚠${N} %s\n" "$*"; }
die()  { printf "${R}✗ %s${N}\n" "$*" >&2; exit 1; }
hr()   { printf "${DIM}────────────────────────────────────────────────────────${N}\n"; }

# Banner de marca: box-drawing con fallback ASCII puro para TERM sin UTF-8 (§3).
banner() {
  printf '%s' "$AC"
  if [[ "${LC_ALL:-}${LC_CTYPE:-}${LANG:-}" == *[Uu][Tt][Ff]* ]]; then
    cat <<'EOF'
  ███╗   ██╗ ██████╗  ██████╗████████╗ ██████╗ ██████╗ ███╗   ███╗
  ████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔════╝██╔═══██╗████╗ ████║
  ██╔██╗ ██║██║   ██║██║        ██║   ██║     ██║   ██║██╔████╔██║
  ██║╚██╗██║██║   ██║██║        ██║   ██║     ██║   ██║██║╚██╔╝██║
  ██║ ╚████║╚██████╔╝╚██████╗   ██║   ╚██████╗╚██████╔╝██║ ╚═╝ ██║
  ╚═╝  ╚═══╝ ╚═════╝  ╚═════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝     ╚═╝
EOF
  else
    cat <<'EOF'
   _   _            _
  | \ | | ___   ___| |_ ___ ___  _ __ ___
  |  \| |/ _ \ / __| __/ __/ _ \| '_ ` _ \
  | |\  | (_) | (__| || (_| (_) | | | | | |
  |_| \_|\___/ \___|\__\___\___/|_| |_| |_|
EOF
  fi
  printf '%s' "$N"
  printf '%s\n' "${DIM}  Almacenamiento cifrado de conocimiento cero · by Redder Labs${N}"
  printf '%s\n' "${DIM}  Proxmox VE · LXC installer · AGPL-3.0${N}"
}

ask() { # ask <prompt> <default> <var>  (lee de /dev/tty aunque venga por tubería)
  local prompt="$1" default="$2" __var="$3" reply=""
  if [ "${NOCTCOM_NONINTERACTIVE:-0}" = "1" ] || [ ! -e /dev/tty ]; then
    printf -v "$__var" '%s' "$default"; return
  fi
  printf "${B}%s${N}${DIM}%s${N} " "$prompt" "${default:+ [$default]}" > /dev/tty
  read -r reply < /dev/tty || true
  printf -v "$__var" '%s' "${reply:-$default}"
}

# ─── Asistente TUI (whiptail) ───────────────────────────────────
# Se usa si hay terminal interactiva y whiptail disponible; si no, el script
# cae a valores por defecto/variables de entorno sin pedir nada.
USE_TUI=0
if [ "${NOCTCOM_NONINTERACTIVE:-0}" != "1" ] && [ -t 0 ] && [ -t 2 ] && command -v whiptail >/dev/null 2>&1; then
  USE_TUI=1
fi

# Tema "noche" de las cajas whiptail (§2.2). Respeta NO_COLOR (§7).
if [ "$USE_TUI" = "1" ] && [ -z "${NO_COLOR:-}" ]; then
  export NEWT_COLORS='
root=,black
window=,black
border=brightcyan,black
title=brightcyan,black
textbox=white,black
listbox=white,black
actlistbox=black,brightcyan
button=black,brightcyan
actbutton=white,blue
checkbox=white,black
actcheckbox=black,brightcyan
entry=white,black
label=brightcyan,black
roottext=white,black
'
fi

tui_input() { # tui_input <título> <texto> <default> [alto] [ancho]
  whiptail --title "Noctcom · $1" --inputbox "$2" "${4:-9}" "${5:-66}" "$3" 3>&1 1>&2 2>&3
}

printf '\n'
banner
printf '\n'

# ─── 1. Requisitos (host Proxmox) ───────────────────────────────
say "${B}1. Comprobando el host Proxmox…${N}"
command -v pct    >/dev/null 2>&1 || die "No encuentro 'pct'. Este script se ejecuta EN EL HOST Proxmox VE."
command -v pveam  >/dev/null 2>&1 || die "No encuentro 'pveam'. Este script se ejecuta EN EL HOST Proxmox VE."
command -v pvesh  >/dev/null 2>&1 || die "No encuentro 'pvesh'. Este script se ejecuta EN EL HOST Proxmox VE."
[ "$(id -u)" = "0" ] || die "Ejecútalo como root en el host Proxmox."
ok "Host Proxmox VE detectado ($(pveversion 2>/dev/null || echo 'pveversion no disponible'))"

# ─── 2. Configuración (defaults → env → asistente) ──────────────
CTID="${NOCTCOM_CTID:-$(pvesh get /cluster/nextid)}"
HOSTNAME="${NOCTCOM_HOSTNAME:-noctcom}"
CORES="${NOCTCOM_CORES:-2}"
RAM="${NOCTCOM_RAM:-4096}"
DISK="${NOCTCOM_DISK:-20}"
STORAGE="${NOCTCOM_STORAGE:-local-lvm}"
TPL_STORAGE="${NOCTCOM_TEMPLATE_STORAGE:-local}"
BRIDGE="${NOCTCOM_BRIDGE:-vmbr0}"
DOMAIN="${NOCTCOM_DOMAIN:-}"
EMAIL="${NOCTCOM_EMAIL:-}"
NET_MODE="${NOCTCOM_NET:-dhcp}"
NET_IP="${NOCTCOM_IP:-}"
NET_GW="${NOCTCOM_GATEWAY:-}"
REF="${NOCTCOM_REF:-main}"   # rama/tag del repo a instalar

if [ "$USE_TUI" = "1" ]; then
  say ""
  # 2.1 Bienvenida
  whiptail --title "Noctcom" --msgbox \
"Bienvenido al instalador de Noctcom.

Esto creará un contenedor LXC Debian y desplegará Noctcom de forma nativa (Docker dentro del LXC).

Necesitarás ~4 GB de RAM y disco para los blobs cifrados." 15 66

  # 2.2 Modo
  MODE="$(whiptail --title "Noctcom · Tipo de instalación" --menu \
"¿Cómo quieres configurar el contenedor?" 13 66 2 \
    "rapido"   "Ajustes por defecto (recomendado)" \
    "avanzado" "Personalizar CPU, RAM, disco, red…" \
    3>&1 1>&2 2>&3)" || die "Instalación cancelada."

  # 2.3 Recursos (solo avanzado)
  if [ "$MODE" = "avanzado" ]; then
    CTID="$(tui_input "Recursos" "ID del contenedor (CTID):" "$CTID")"          || die "Instalación cancelada."
    HOSTNAME="$(tui_input "Recursos" "Hostname del contenedor:" "$HOSTNAME")"   || die "Instalación cancelada."
    CORES="$(tui_input "Recursos" "vCPU (núcleos):" "$CORES")"                  || die "Instalación cancelada."
    RAM="$(tui_input "Recursos" "RAM en MiB (mínimo recomendado 4096):" "$RAM")" || die "Instalación cancelada."
    DISK="$(tui_input "Recursos" "Disco raíz en GB:" "$DISK")"                  || die "Instalación cancelada."
    STORAGE="$(tui_input "Recursos" "Storage del rootfs:" "$STORAGE")"          || die "Instalación cancelada."
    BRIDGE="$(tui_input "Recursos" "Bridge de red:" "$BRIDGE")"                 || die "Instalación cancelada."
  fi

  # 2.4 Dominio / TLS
  DOMAIN="$(tui_input "Dominio" "Dominio base (déjalo VACÍO para modo LAN por IP, sin TLS):" "$DOMAIN")" || die "Instalación cancelada."
  if [ -n "$DOMAIN" ]; then
    EMAIL="$(tui_input "Dominio" "Email para los certificados TLS (Let's Encrypt):" "${EMAIL:-admin@$DOMAIN}")" || die "Instalación cancelada."
  fi

  # 2.5 Red
  if whiptail --title "Noctcom · Red" --yesno \
"¿Usar DHCP para la red del contenedor?

Sí = la IP se asigna automáticamente (recomendado).
No = configurar una IP estática." 12 66; then
    NET_MODE="dhcp"
  else
    NET_MODE="static"
    NET_IP="$(tui_input "Red estática" "IP con máscara CIDR (p. ej. 192.168.1.50/24):" "$NET_IP")"  || die "Instalación cancelada."
    NET_GW="$(tui_input "Red estática" "Puerta de enlace (gateway), p. ej. 192.168.1.1:" "$NET_GW")" || die "Instalación cancelada."
  fi
else
  # Sin TUI: conserva el flujo previo (defaults/env + pregunta mínima por tty).
  [ -z "$DOMAIN" ] && ask "   Dominio (vacío = modo LAN por IP, sin TLS):" "" DOMAIN
  [ -z "$EMAIL" ] && [ -n "$DOMAIN" ] && ask "   Email para los certificados TLS:" "admin@$DOMAIN" EMAIL
fi

# Validación de la IP estática (en cualquier modo).
if [ "$NET_MODE" = "static" ]; then
  [ -n "$NET_IP" ] || die "Modo de red estática sin IP. Indica IP/CIDR (NOCTCOM_IP) o usa DHCP."
  [ -n "$NET_GW" ] || die "Modo de red estática sin gateway. Indica la puerta de enlace (NOCTCOM_GATEWAY)."
  case "$NET_IP" in
    */*) : ;;
    *) die "La IP estática debe incluir el CIDR, p. ej. ${NET_IP}/24." ;;
  esac
  NET0="name=eth0,bridge=$BRIDGE,ip=$NET_IP,gw=$NET_GW"
  NETDESC="estática $NET_IP (gw $NET_GW)"
else
  NET0="name=eth0,bridge=$BRIDGE,ip=dhcp"
  NETDESC="DHCP"
fi

# Resumen + confirmación (§5.6: destructivo → defaultno; aquí no lo es).
printf -v SUMMARY 'CTID:        %s\nHostname:    %s\nvCPU / RAM:  %s / %s MiB\nDisco raíz:  %s GB en %s\nBridge:      %s\nRed:         %s\nDominio:     %s' \
  "$CTID" "$HOSTNAME" "$CORES" "$RAM" "$DISK" "$STORAGE" "$BRIDGE" "$NETDESC" "${DOMAIN:-(modo LAN por IP)}"
if [ "$USE_TUI" = "1" ]; then
  whiptail --title "Noctcom · Resumen" --yesno "$SUMMARY"$'\n\n'"¿Crear el contenedor con estos ajustes?" 17 66 \
    || die "Instalación cancelada."
fi
say ""
say "${B}2. Configuración${N}"
say "${DIM}$SUMMARY${N}"

# ─── 3. Plantilla Debian ────────────────────────────────────────
say ""
say "${B}3. Plantilla Debian 13…${N}"
pveam update >/dev/null 2>&1 || true
# '|| true': con pipefail, un grep sin resultados mataría el script sin mensaje.
TEMPLATE="$(pveam available --section system 2>/dev/null | awk '{print $2}' | grep -E '^debian-13-standard' | sort -V | tail -1 || true)"
[ -n "$TEMPLATE" ] || die "No encuentro la plantilla debian-13-standard ('pveam available')."
if pveam list "$TPL_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  ok "Plantilla ya descargada: $TEMPLATE"
else
  info "Descargando $TEMPLATE…"
  pveam download "$TPL_STORAGE" "$TEMPLATE" >/dev/null
  ok "Plantilla descargada en '$TPL_STORAGE'"
fi

# ─── 4. Crear el LXC ────────────────────────────────────────────
say ""
say "${B}4. Creando el LXC #$CTID…${N}"
pct status "$CTID" >/dev/null 2>&1 && die "Ya existe un contenedor con ID $CTID. Usa NOCTCOM_CTID=<otro>."
pct create "$CTID" "$TPL_STORAGE:vztmpl/$TEMPLATE" \
  --hostname "$HOSTNAME" \
  --cores "$CORES" --memory "$RAM" --swap 512 \
  --rootfs "$STORAGE:$DISK" \
  --net0 "$NET0" \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --onboot 1 \
  --tags noctcom \
  --start 1 >/dev/null
ok "LXC creado y arrancado (no privilegiado, nesting para Docker)"

# Determina la IP del contenedor.
if [ "$NET_MODE" = "static" ]; then
  IP="${NET_IP%/*}"
  ok "IP estática del contenedor: $IP"
else
  info "Esperando IP por DHCP…"
  IP=""
  for _ in $(seq 1 30); do
    IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')" || true
    [ -n "$IP" ] && break
    sleep 2
  done
  [ -n "$IP" ] || die "El contenedor no obtuvo IP. ¿Hay DHCP en el bridge $BRIDGE?"
  ok "IP del contenedor: $IP"
fi

# ─── 5. Docker + Noctcom dentro del LXC ─────────────────────────
say ""
say "${B}5. Instalando Docker en el LXC…${N}"
pct exec "$CTID" -- bash -c "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -yqq curl git openssl ca-certificates >/dev/null"
pct exec "$CTID" -- bash -c "curl -fsSL https://get.docker.com | sh >/dev/null 2>&1"
pct exec "$CTID" -- docker --version >/dev/null 2>&1 || die "Docker no quedó operativo dentro del LXC."
ok "Docker instalado dentro del LXC"

say ""
say "${B}6. Instalando Noctcom (la primera vez tarda unos minutos)…${N}"
pct exec "$CTID" -- env \
  NOCTCOM_DIR=/opt/noctcom \
  NOCTCOM_NONINTERACTIVE=1 \
  NOCTCOM_REF="$REF" \
  NOCTCOM_DOMAIN="$DOMAIN" \
  NOCTCOM_EMAIL="$EMAIL" \
  bash -c "curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/$REF/install.sh | bash"

# ─── Resumen final ──────────────────────────────────────────────
if [ -n "$DOMAIN" ]; then
  printf -v DONE 'Noctcom está instalado en el LXC #%s.\n\nApp:  https://app.%s\nAPI:  https://api.%s\n\nApunta los DNS (registros A) de app.%s y api.%s a %s\n(y redirige 80/443 del router al LXC si está tras NAT).' \
    "$CTID" "$DOMAIN" "$DOMAIN" "$DOMAIN" "$DOMAIN" "$IP"
else
  printf -v DONE 'Noctcom está instalado en el LXC #%s.\n\nApp + API:  https://%s   (la API va bajo https://%s/api)\n\nModo LAN con HTTPS interno (certificado autofirmado): la 1ª vez el navegador avisará del certificado, acéptalo. Entra por https://%s desde cualquier equipo de la red. La web usa rutas relativas, así que sigue funcionando aunque cambie la IP.' \
    "$CTID" "$IP" "$IP" "$IP"
fi
if [ "$USE_TUI" = "1" ]; then
  whiptail --title "Noctcom · Instalación completada ✓" --msgbox "$DONE" 17 70 || true
fi

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
  say "  App + API:  ${B}https://$IP${N}   ${DIM}(modo LAN; la API va bajo https://$IP/api)${N}"
  say ""
  say "  ${O}⚠ La 1ª vez el navegador avisará del certificado autofirmado (HTTPS interno): acéptalo.${N}"
  say "  ${DIM}La web usa rutas relativas: el inicio de sesión sigue funcionando aunque${N}"
  say "  ${DIM}cambie la IP. Aun así conviene reservar esta IP en tu DHCP para las${N}"
  say "  ${DIM}subidas grandes (PUBLIC_URL). Entra por https://$IP desde cualquier equipo.${N}"
fi
say ""
say "  Entrar al LXC:  ${B}pct enter $CTID${N}"
say "  Ver logs:       ${B}pct exec $CTID -- bash -lc 'cd /opt/noctcom && docker compose logs -f'${N}"
say "  Actualizar:     ${B}pct exec $CTID -- bash -lc 'cd /opt/noctcom && bash update.sh'${N}"
say ""
say "  ${DIM}Self-host gratis para siempre · AGPL-3.0 · https://noctcom.com${N}"
say ""
