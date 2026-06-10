#!/usr/bin/env bash
#
# Noctcom — actualizador self-host
#
#   bash update.sh          (desde la carpeta de la instalación)
#
# Trae los últimos cambios del repo (git pull), reconcilia el .env aplicando las
# migraciones necesarias y reconstruye los contenedores. NO reinstala ni toca
# tus secretos: es la forma de aplicar las mejoras publicadas en el repo sin
# volver a instalar.
#
# Reutiliza install.sh (que es idempotente cuando ya existe un .env), así que
# toda migración nueva del instalador se aplica también al actualizar.
#
set -euo pipefail

if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; G=$'\033[32m'; R=$'\033[31m'; N=$'\033[0m'
else
  B=""; DIM=""; G=""; R=""; N=""
fi

# Carpeta de la instalación = donde vive este script (el repo clonado).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

[ -d .git ] || { printf "${R}✗ %s no es un clon de git. Ejecuta update.sh dentro de la carpeta de la instalación.${N}\n" "$DIR" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { printf "${R}✗ No encuentro 'docker'.${N}\n" >&2; exit 1; }

printf "\n${B}Noctcom${N} ${DIM}· actualizando en %s…${N}\n\n" "$DIR"

printf "${B}1. Trayendo cambios (git pull)…${N}\n"
git pull --ff-only || {
  printf "${R}✗ 'git pull --ff-only' falló. ¿Hay cambios locales sin commitear?${N}\n" >&2
  printf "${DIM}  Revisa 'git status'. Si no esperabas cambios locales: 'git stash' y reintenta.${N}\n" >&2
  exit 1
}

# install.sh, con .env ya presente: conserva secretos, reconcilia/migra el .env
# y reconstruye (docker compose up -d --build). Como el pull ya se hizo, corre
# la versión recién actualizada del instalador.
printf "\n${B}2. Aplicando configuración y reconstruyendo…${N}\n"
env NOCTCOM_DIR="$DIR" bash "$DIR/install.sh"

# Libera espacio tras el rebuild (homelab/LXC con disco justo).
docker image prune -f >/dev/null 2>&1 || true

printf "\n${G}✓ Actualización completada.${N}\n\n"
