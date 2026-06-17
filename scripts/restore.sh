#!/usr/bin/env bash
#
# Noctcom — restore self-host (Fase 7: robustez de datos)
#
#   bash scripts/restore.sh <fichero.tar.gz>
#
# Restaura una copia hecha con backup.sh: recrea la base de datos y reemplaza el
# contenido de los volúmenes minio_data, blob_data y los discos extra. Deja DB y
# blobs COHERENTES en el tiempo (los tres salen del mismo backup).
#
# ⚠️ DESTRUCTIVO: sobrescribe TODOS los datos actuales de esta instancia. Pide
# confirmación escrita. Pensado para restaurar sobre una instalación ya creada
# (ejecuta install.sh antes si es una máquina nueva).
#
set -euo pipefail

if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
else B=""; DIM=""; G=""; Y=""; R=""; N=""; fi
say()  { printf "%s\n" "$*"; }
ok()   { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}!${N} %s\n" "$*"; }
die()  { printf "${R}✗ %s${N}\n" "$*" >&2; exit 1; }

ARCHIVE="${1:-}"
[ -n "$ARCHIVE" ] || die "Uso: bash scripts/restore.sh <fichero.tar.gz>"
[ -f "$ARCHIVE" ] || die "No encuentro el fichero de backup: $ARCHIVE"
ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"  # ruta absoluta

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
[ -f .env ] || die "No encuentro .env en $DIR. Ejecuta restore.sh dentro de la carpeta de la instalación."

# ─── Docker / Compose (con sudo si hace falta) ──────────────────
if [ "$(id -u)" = "0" ]; then SUDO=""; elif command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else SUDO=""; fi
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if [ -n "$SUDO" ] && $SUDO docker info >/dev/null 2>&1; then DOCKER="$SUDO docker"; else
    die "El demonio de Docker no responde."; fi
fi
if $DOCKER compose version >/dev/null 2>&1; then DC="$DOCKER compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="${SUDO:+$SUDO }docker-compose"
else die "Falta Docker Compose."; fi

# ─── Extraer el backup a un staging temporal ────────────────────
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
tar xzf "$ARCHIVE" -C "$STAGE" || die "El fichero no es un backup válido de Noctcom."
[ -f "$STAGE/manifest.txt" ] || die "Backup sin manifest.txt — ¿es de Noctcom?"

getmani() { grep -E "^$1=" "$STAGE/manifest.txt" | head -1 | cut -d= -f2-; }
PG_USER="$(getmani pg_user)"; PG_USER="${PG_USER:-noctcom}"
PG_DB="$(getmani pg_db)";     PG_DB="${PG_DB:-noctcom}"
BK_TS="$(getmani timestamp)"; BK_VER="$(getmani version)"

say ""
say "${B}Restaurar Noctcom desde:${N} $ARCHIVE"
say "  ${DIM}backup: $BK_TS · versión: $BK_VER · db: $PG_DB${N}"
warn "Esto SOBRESCRIBE todos los datos actuales (base de datos, minio_data, blob_data y discos extra)."
if [ -e /dev/tty ]; then
  printf "${B}Escribe RESTAURAR para continuar:${N} " > /dev/tty
  read -r CONFIRM < /dev/tty || true
  [ "$CONFIRM" = "RESTAURAR" ] || die "Cancelado (no se escribió RESTAURAR)."
else
  [ "${NOCTCOM_RESTORE_YES:-0}" = "1" ] || die "Sin terminal: define NOCTCOM_RESTORE_YES=1 para confirmar sin interacción."
fi

# Nombre real del volumen montado en <dest> por <servicio> (sirve aunque el
# contenedor esté parado: -a incluye parados y docker inspect los lee).
resolve_vol() { # resolve_vol <servicio> <dest>
  local cid; cid="$($DC ps -aq "$1" 2>/dev/null | head -1)"
  [ -n "$cid" ] || return 1
  $DOCKER inspect -f '{{ range .Mounts }}{{ if eq .Destination "'"$2"'" }}{{ .Name }}{{ end }}{{ end }}' "$cid" 2>/dev/null
}

# Reemplaza el contenido de un volumen con el de un .tar.gz del staging.
restore_volume() { # restore_volume <volumen> <nombre>
  [ -f "$STAGE/$2.tar.gz" ] || { warn "El backup no incluye $2 — lo dejo como está."; return 0; }
  $DOCKER run --rm -v "$1":/v -v "$STAGE":/in alpine \
    sh -c "rm -rf /v/* /v/..?* /v/.[!.]* 2>/dev/null; tar xzf /in/$2.tar.gz -C /v" \
    && ok "Restaurado $2" || warn "Fallo restaurando $2"
}

# ─── 1. Asegura contenedores/volúmenes y para los escritores ────
say "\n${B}1. Preparando el stack…${N}"
$DC up -d >/dev/null 2>&1 || die "No pude crear/arrancar el stack (revisa 'docker compose')."
sleep 3
$DC stop backend frontend >/dev/null 2>&1 || true
ok "Backend y frontend detenidos durante el restore"

# ─── 2. PostgreSQL (recrear DB + cargar dump) ───────────────────
say "${B}2. PostgreSQL…${N}"
[ -f "$STAGE/db.sql.gz" ] || die "El backup no incluye db.sql.gz."
# DROP ... WITH (FORCE) (PG13+) corta las conexiones residuales y recrea limpio.
$DC exec -T postgres psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 -c \
  "DROP DATABASE IF EXISTS \"$PG_DB\" WITH (FORCE); CREATE DATABASE \"$PG_DB\" OWNER \"$PG_USER\";" \
  || die "No pude recrear la base de datos."
gunzip -c "$STAGE/db.sql.gz" | $DC exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 >/dev/null \
  || die "Falló la carga del dump en PostgreSQL."
ok "Base de datos restaurada"

# ─── 3. Volúmenes de blobs ──────────────────────────────────────
say "${B}3. minio_data…${N}"
$DC stop minio >/dev/null 2>&1 || true
MINIO_VOL="$(resolve_vol minio /data || true)"
[ -n "$MINIO_VOL" ] && restore_volume "$MINIO_VOL" minio_data || warn "No pude resolver minio_data."

say "${B}4. blob_data…${N}"
BLOB_VOL="$(resolve_vol backend /data || true)"
[ -n "$BLOB_VOL" ] && restore_volume "$BLOB_VOL" blob_data || warn "No pude resolver blob_data."

# ─── 5. Discos extra (según el manifiesto) ──────────────────────
while IFS='=' read -r arch path; do
  case "$arch" in extra_*.tar.gz)
    [ -n "$path" ] && [ -f "$STAGE/$arch" ] || continue
    if [ -d "$path" ]; then
      say "${B}5. Disco extra → $path…${N}"
      $SUDO sh -c "rm -rf '$path'/* '$path'/..?* '$path'/.[!.]* 2>/dev/null; tar xzf '$STAGE/$arch' -C '$path'" \
        && ok "Restaurado $path" || warn "Fallo restaurando $path"
    else
      warn "Ruta extra del backup inexistente ahora: $path (omitida; créala y reintenta si la necesitas)."
    fi
  ;; esac
done < "$STAGE/manifest.txt"

# ─── 6. Arrancar todo ───────────────────────────────────────────
say "${B}6. Arrancando el stack…${N}"
$DC up -d >/dev/null 2>&1 || die "No pude arrancar el stack tras el restore."
ok "Stack en marcha"

say ""
say "${G}${B}✓ Restore completado desde $BK_TS.${N}"
say "  ${DIM}Comprueba el acceso en tu URL y que los archivos se abren. DB y blobs vienen${N}"
say "  ${DIM}del mismo backup, así que son coherentes entre sí.${N}"
say ""
