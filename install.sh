#!/usr/bin/env bash
#
# Noctcom — self-host installer
#
#   curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/install.sh | bash
#
# Clona el repo, genera un .env con secretos seguros y levanta el stack con
# Docker Compose (PostgreSQL + Redis + MinIO + backend + frontend + Caddy con
# TLS automático). Idempotente: si ya existe un .env, conserva tus secretos.
#
# Variables de entorno opcionales (para instalación no interactiva):
#   NOCTCOM_DIR=noctcom         carpeta destino
#   NOCTCOM_DOMAIN=example.com  dominio base (usa app.<dominio> y api.<dominio>)
#   NOCTCOM_EMAIL=you@mail.com  email para los certificados Let's Encrypt
#   NOCTCOM_LAN_IP=auto         modo LAN sin dominio: IP a usar ('auto' = detectar)
#   NOCTCOM_NONINTERACTIVE=1    no preguntar; sin NOCTCOM_DOMAIN usa modo LAN
#   NOCTCOM_NO_START=1          solo prepara .env, no arranca los contenedores
#
# Sin dominio → modo LAN: HTTP plano por IP (app en :80, API en :3000), ideal
# para homelab/LXC. Con dominio → Caddy emite TLS automático (Let's Encrypt).
#
set -euo pipefail

REPO_URL="https://github.com/RedderLabs/noctcom.git"
DIR="${NOCTCOM_DIR:-noctcom}"

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

# Lee de la terminal aunque el script venga por una tubería (curl | bash).
ask() { # ask <prompt> <default> <var>
  local prompt="$1" default="$2" __var="$3" reply=""
  if [ "${NOCTCOM_NONINTERACTIVE:-0}" = "1" ] || [ ! -e /dev/tty ]; then
    printf -v "$__var" '%s' "$default"; return
  fi
  printf "${B}%s${N}${DIM}%s${N} " "$prompt" "${default:+ [$default]}" > /dev/tty
  read -r reply < /dev/tty || true
  printf -v "$__var" '%s' "${reply:-$default}"
}

# Secreto seguro y URL-safe (sin caracteres que rompan DATABASE_URL/REDIS_URL).
secret() { openssl rand -hex 24; }

printf "\n${V}${B}  Noctcom${N} ${DIM}· self-host installer${N}\n"
printf "${DIM}  Zero-knowledge encrypted storage · AGPL-3.0${N}\n\n"

# ─── 1. Requisitos ──────────────────────────────────────────────
say "${B}1. Comprobando requisitos…${N}"
need() { command -v "$1" >/dev/null 2>&1 || die "Falta '$1'. Instálalo y reintenta. $2"; }
need git ""
need openssl ""
need docker "→ https://docs.docker.com/engine/install/"
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  die "Falta Docker Compose v2 (plugin 'docker compose'). → https://docs.docker.com/compose/install/"
fi
docker info >/dev/null 2>&1 || die "El demonio de Docker no está en marcha (o falta permiso; prueba con sudo)."
ok "git, openssl y Docker ($DC) disponibles"

# ─── 2. Código ──────────────────────────────────────────────────
say ""
say "${B}2. Obteniendo el código…${N}"
if [ -d "$DIR/.git" ]; then
  ok "Repo ya presente en '$DIR' — actualizando"
  git -C "$DIR" pull --ff-only || warn "No se pudo hacer fast-forward; sigo con lo que hay."
else
  git clone --depth 1 "$REPO_URL" "$DIR"
  ok "Clonado en '$DIR'"
fi
cd "$DIR"

# ─── 3. Configuración (.env) ────────────────────────────────────
say ""
say "${B}3. Configuración…${N}"
if [ -f .env ]; then
  warn ".env ya existe — conservo tus secretos y no lo toco."
  if ! grep -q '^COMPOSE_FILE=' .env; then
    printf '\n# Fijado por install.sh: evita cargar docker-compose.override.yml (solo desarrollo).\nCOMPOSE_FILE=docker-compose.yml\n' >> .env
    warn "Añadido COMPOSE_FILE a .env (el override de desarrollo publicaba puertos de postgres/redis/minio al host)."
  fi
  # Migración a same-origin (solo modo LAN): si la API se horneó en http://<ip>:3000,
  # vaciamos PUBLIC_API_URL para que el frontend use URLs relativas (mismo origen,
  # vía Caddyfile.lan) y quitamos el :3000 de PUBLIC_URL (las subidas de chunks
  # viajan ahora por el :80 bajo /api). Deja de depender de la IP y del puerto 3000.
  if grep -q '^CADDY_DOMAIN=localhost' .env && grep -qE '^PUBLIC_API_URL=.+' .env; then
    sed -i.bak -E 's|^PUBLIC_API_URL=.*|PUBLIC_API_URL=|' .env
    sed -i.bak -E 's|^(PUBLIC_URL=https?://[^:/]+):3000$|\1|' .env
    rm -f .env.bak
    warn "Modo LAN migrado a same-origin (PUBLIC_API_URL vaciado → URLs relativas). Se reconstruye el frontend."
  fi
else
  [ -f .env.example ] || die "No encuentro .env.example en el repo."

  DOMAIN="${NOCTCOM_DOMAIN:-}"
  [ -z "$DOMAIN" ] && ask "   Dominio base (vacío = modo LAN por IP, sin TLS):" "" DOMAIN
  EMAIL="${NOCTCOM_EMAIL:-}"
  [ -z "$EMAIL" ] && [ -n "$DOMAIN" ] && ask "   Email para los certificados TLS:" "admin@$DOMAIN" EMAIL

  COMPOSE_FILES="docker-compose.yml"
  if [ -n "$DOMAIN" ]; then
    FRONT="https://app.$DOMAIN"; API="https://api.$DOMAIN"; APIBASE="$API"; FROM="noreply@$DOMAIN"
  else
    # Modo LAN same-origin: sin dominio. Caddy (Caddyfile.lan) sirve la web Y la
    # API en el mismo :80 (enruta /api y /health al backend). El frontend usa
    # URLs RELATIVAS → PUBLIC_API_URL va VACÍO: funciona con cualquier IP o
    # hostname y aguanta cambios de DHCP sin rehornear el build. PUBLIC_URL
    # (backend; p. ej. las URLs absolutas de subida de chunks) sí necesita una
    # base válida → http://<IP> (puerto 80, donde vive /api).
    LAN_IP="${NOCTCOM_LAN_IP:-auto}"
    if [ "$LAN_IP" = "auto" ]; then
      # '|| true': con pipefail, un 'hostname -I' que falle mataría el script.
      LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    fi
    [ -z "$LAN_IP" ] && LAN_IP="127.0.0.1"
    DOMAIN="localhost"; EMAIL="${EMAIL:-admin@localhost}"
    FRONT="http://$LAN_IP"; API=""; APIBASE="http://$LAN_IP"; FROM="noreply@localhost"
    COMPOSE_FILES="docker-compose.yml:docker-compose.lan.yml"
    warn "Sin dominio: modo LAN same-origin por IP ($LAN_IP), sin TLS. Para producción, relanza con un dominio."
  fi

  cp .env.example .env
  sed_i() { sed -i.bak "s|$1|$2|" .env && rm -f .env.bak; }
  sed_i '^CADDY_DOMAIN=.*'        "CADDY_DOMAIN=$DOMAIN"
  sed_i '^CADDY_EMAIL=.*'         "CADDY_EMAIL=$EMAIL"
  sed_i '^POSTGRES_PASSWORD=.*'   "POSTGRES_PASSWORD=$(secret)"
  sed_i '^REDIS_PASSWORD=.*'      "REDIS_PASSWORD=$(secret)"
  sed_i '^MINIO_ROOT_PASSWORD=.*' "MINIO_ROOT_PASSWORD=$(secret)"
  sed_i '^JWT_SECRET=.*'          "JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')"
  sed_i '^PUBLIC_URL=.*'          "PUBLIC_URL=$APIBASE"
  sed_i '^PUBLIC_API_URL=.*'      "PUBLIC_API_URL=$API"
  sed_i '^FRONTEND_URL=.*'        "FRONTEND_URL=$FRONT"
  sed_i '^SMTP_FROM=.*'           "SMTP_FROM=$FROM"
  # COMPOSE_FILE fija qué ficheros usa 'docker compose' desde esta carpeta:
  # nunca el override de desarrollo; en modo LAN añade docker-compose.lan.yml.
  printf '\n# Ficheros compose (escrito por install.sh).\nCOMPOSE_FILE=%s\n' "$COMPOSE_FILES" >> .env
  chmod 600 .env
  ok "Generado .env con secretos aleatorios (chmod 600)"
  say "${DIM}   Email (verificación/OTP) desactivado por defecto: añade RESEND_API_KEY o SMTP_* en .env.${N}"
fi

# ─── 4. Arranque ────────────────────────────────────────────────
if [ "${NOCTCOM_NO_START:-0}" = "1" ]; then
  say ""
  warn "NOCTCOM_NO_START=1 — no arranco. Revisa .env y luego: ${B}$DC up -d --build${N}"
  exit 0
fi
say ""
say "${B}4. Construyendo y levantando (la primera vez tarda unos minutos)…${N}"
$DC up -d --build
# Caddy NO se recrea cuando solo cambia el Caddyfile montado (no su imagen), así
# que se quedaría con la config vieja (p. ej. el enrutado /api del modo LAN). Lo
# reiniciamos para que cargue siempre la configuración actual.
$DC restart caddy >/dev/null 2>&1 || true
ok "Contenedores en marcha"

# ─── Resumen ────────────────────────────────────────────────────
DOM="$(grep -E '^CADDY_DOMAIN=' .env | cut -d= -f2- || true)"
FRONT_URL="$(grep -E '^FRONTEND_URL=' .env | cut -d= -f2- || true)"
say ""
hr
printf "${G}${B}  ¡Noctcom está arrancando!${N}\n"
hr
if [ "$DOM" = "localhost" ]; then
  say "  App + API:  ${B}${FRONT_URL}${N}   ${DIM}(API bajo ${FRONT_URL}/api)${N}"
  say "  ${DIM}(modo LAN same-origin sin TLS, accesible desde tu red — para producción usa un dominio real)${N}"
  say "  ${DIM}Inicia sesión por esta URL desde cualquier equipo de la red. La web usa rutas${N}"
  say "  ${DIM}relativas, así que sigue funcionando aunque cambie la IP de esta máquina.${N}"
else
  say "  App:  ${B}https://app.$DOM${N}"
  say "  API:  ${B}https://api.$DOM${N}"
  say ""
  say "  ${Y}Apunta estos DNS (registros A) a la IP de este servidor:${N}"
  say "    app.$DOM    →  <IP>"
  say "    api.$DOM    →  <IP>"
  say "  ${DIM}Caddy emitirá los certificados TLS automáticamente al resolver el DNS.${N}"
fi
say ""
say "  ${DIM}(desde la carpeta '$DIR')${N}"
say "  Ver logs:   ${B}$DC logs -f${N}"
say "  Parar:      ${B}$DC down${N}      ·   Actualizar: ${B}bash update.sh${N}"
say "  Email:      añade ${B}RESEND_API_KEY${N} o ${B}SMTP_*${N} en .env para verificación/OTP."
say ""
say "  ${DIM}Self-host gratis para siempre · AGPL-3.0 · https://noctcom.com${N}"
say ""
