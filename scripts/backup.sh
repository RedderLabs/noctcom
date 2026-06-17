#!/usr/bin/env bash
#
# Noctcom — backup self-host (Fase 7: robustez de datos)
#
#   bash scripts/backup.sh            (desde la carpeta de la instalación)
#
# Crea una copia COHERENTE y restaurable de los tres almacenes de estado del
# self-host, en un único .tar.gz con marca de tiempo:
#   · PostgreSQL  → dump lógico (pg_dump) de los metadatos.
#   · minio_data  → blobs cifrados que fueron a object storage (MinIO).
#   · blob_data   → blobs cifrados guardados en disco (BLOB_VOLUME_PATH=/data).
#   · EXTRA_DATA_DIR → discos extra del backend (si los hay).
# (redis_data = caché y caddy_data = certificados se regeneran solos: no se copian.)
#
# Restaurar:  bash scripts/restore.sh <fichero.tar.gz>
#
# Variables opcionales:
#   NOCTCOM_BACKUP_DIR=backups   carpeta destino (por defecto ./backups)
#   NOCTCOM_BACKUP_KEEP=7        copias a conservar (rota las más antiguas)
#
set -euo pipefail

if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
else B=""; DIM=""; G=""; Y=""; R=""; N=""; fi
say()  { printf "%s\n" "$*"; }
ok()   { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}!${N} %s\n" "$*"; }
die()  { printf "${R}✗ %s${N}\n" "$*" >&2; exit 1; }

# Carpeta de la instalación = el repo (este script vive en scripts/).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
[ -f .env ] || die "No encuentro .env en $DIR. Ejecuta backup.sh dentro de la carpeta de la instalación."

# ─── Docker / Compose (con sudo si hace falta) ──────────────────
if [ "$(id -u)" = "0" ]; then SUDO=""; elif command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else SUDO=""; fi
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if [ -n "$SUDO" ] && $SUDO docker info >/dev/null 2>&1; then DOCKER="$SUDO docker"; else
    die "El demonio de Docker no responde (¿arrancado? ¿permisos?)."; fi
fi
if $DOCKER compose version >/dev/null 2>&1; then DC="$DOCKER compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="${SUDO:+$SUDO }docker-compose"
else die "Falta Docker Compose."; fi

getenv() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2-; }
PG_USER="$(getenv POSTGRES_USER)"; PG_USER="${PG_USER:-noctcom}"
PG_DB="$(getenv POSTGRES_DB)";     PG_DB="${PG_DB:-noctcom}"
EXTRA_DIRS="$(getenv EXTRA_DATA_DIR)"; EXTRA_DIRS="${EXTRA_DIRS%\"}"; EXTRA_DIRS="${EXTRA_DIRS#\"}"

BACKUP_DIR="${NOCTCOM_BACKUP_DIR:-backups}"
KEEP="${NOCTCOM_BACKUP_KEEP:-7}"
mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
STAGE="$DIR/$BACKUP_DIR/.stage-$TS"
mkdir -p "$STAGE"
trap 'rm -rf "$STAGE"' EXIT

printf "\n${B}Noctcom${N} ${DIM}· backup ($TS)…${N}\n\n"

# Nombre real del volumen montado en <dest> por <servicio> (compose le pone
# prefijo de proyecto, así que lo leemos del contenedor en marcha).
resolve_vol() { # resolve_vol <servicio> <dest>
  local cid; cid="$($DC ps -q "$1" 2>/dev/null | head -1)"
  [ -n "$cid" ] || return 1
  $DOCKER inspect -f '{{ range .Mounts }}{{ if eq .Destination "'"$2"'" }}{{ .Name }}{{ end }}{{ end }}' "$cid" 2>/dev/null
}

# Empaqueta un volumen Docker (solo-lectura) a STAGE vía un alpine efímero.
tar_volume() { # tar_volume <volumen> <nombre-salida>
  $DOCKER run --rm -v "$1":/v:ro -v "$STAGE":/out alpine \
    sh -c "tar czf /out/$2.tar.gz -C /v . 2>/dev/null" || return 1
}

# ─── 1. PostgreSQL (dump lógico, coherente) ─────────────────────
say "${B}1. PostgreSQL (pg_dump)…${N}"
$DC exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --no-privileges \
  | gzip > "$STAGE/db.sql.gz" || die "pg_dump falló (¿está 'postgres' en marcha?)."
ok "Metadatos volcados ($(du -h "$STAGE/db.sql.gz" | cut -f1))"

# ─── 2. minio_data (blobs en object storage) ────────────────────
say "${B}2. minio_data…${N}"
MINIO_VOL="$(resolve_vol minio /data || true)"
if [ -n "$MINIO_VOL" ] && tar_volume "$MINIO_VOL" minio_data; then
  ok "minio_data ($(du -h "$STAGE/minio_data.tar.gz" | cut -f1))"
else
  warn "No pude copiar minio_data (¿servicio minio parado?). Continúo."
fi

# ─── 3. blob_data (blobs en disco) ──────────────────────────────
say "${B}3. blob_data…${N}"
BLOB_VOL="$(resolve_vol backend /data || true)"
if [ -n "$BLOB_VOL" ] && tar_volume "$BLOB_VOL" blob_data; then
  ok "blob_data ($(du -h "$STAGE/blob_data.tar.gz" | cut -f1))"
else
  warn "No pude copiar blob_data (¿servicio backend parado?). Continúo."
fi

# ─── 4. Discos extra (EXTRA_DATA_DIR) ───────────────────────────
EXTRA_MANIFEST=""
if [ -n "$(printf '%s' "$EXTRA_DIRS" | tr -d ', ')" ]; then
  say "${B}4. Discos extra…${N}"
  i=0; OLDIFS="$IFS"; IFS=','
  for d in $EXTRA_DIRS; do
    d="$(printf '%s' "$d" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [ -z "$d" ] && continue
    [ -d "$d" ] || { warn "Ruta extra inexistente: $d (omitida)"; continue; }
    $SUDO tar czf "$STAGE/extra_$i.tar.gz" -C "$d" . 2>/dev/null \
      && { ok "extra_$i ← $d"; EXTRA_MANIFEST="${EXTRA_MANIFEST}extra_$i.tar.gz=$d"$'\n'; } \
      || warn "No pude copiar $d (omitido)"
    i=$((i+1))
  done
  IFS="$OLDIFS"
fi

# ─── 5. Manifiesto + empaquetado final ──────────────────────────
VERSION="$(getenv NOCTCOM_VERSION)"; [ -z "$VERSION" ] && VERSION="$(git -C "$DIR" describe --tags --always 2>/dev/null || echo desconocida)"
{
  printf 'noctcom-backup\ntimestamp=%s\nversion=%s\npg_user=%s\npg_db=%s\n' "$TS" "$VERSION" "$PG_USER" "$PG_DB"
  printf '%s' "$EXTRA_MANIFEST"
} > "$STAGE/manifest.txt"

OUT="$BACKUP_DIR/noctcom-backup-$TS.tar.gz"
tar czf "$OUT" -C "$STAGE" .
chmod 600 "$OUT" 2>/dev/null || true
ok "Backup creado: ${B}$OUT${N} ($(du -h "$OUT" | cut -f1))"

# ─── 6. Rotación (conserva las KEEP más recientes) ──────────────
if [ "$KEEP" -gt 0 ] 2>/dev/null; then
  mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/noctcom-backup-*.tar.gz 2>/dev/null | tail -n +"$((KEEP+1))")
  for f in "${OLD[@]:-}"; do [ -n "$f" ] && rm -f "$f" && warn "Rotado (antiguo): $f"; done
fi

say ""
say "  ${DIM}Restaurar:${N}  ${B}bash scripts/restore.sh $OUT${N}"
say "  ${DIM}Guarda las copias FUERA del servidor (otro disco / equipo). Contienen tus${N}"
say "  ${DIM}datos cifrados: sin la frase/contraseña del usuario no se pueden leer, pero${N}"
say "  ${DIM}aun así trátalas como sensibles.${N}"
say ""
