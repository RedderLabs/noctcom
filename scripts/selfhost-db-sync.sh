#!/usr/bin/env bash
#
# Noctcom — sincronizar el schema del self-host con la nube
#
#   bash scripts/selfhost-db-sync.sh      (desde la carpeta de la instalación)
#
# Aplica los parches de paridad idempotentes (05_cloud_parity.sql,
# 06_selfhost_parity.sql, …) contra el postgres EN MARCHA. Los scripts de
# docker/postgres/init/ solo corren cuando el volumen está vacío (primer
# arranque), así que una BD ya existente no recibe las columnas nuevas. Este
# helper las aplica sin reinstalar ni perder datos. Es seguro re-ejecutarlo.
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

command -v docker >/dev/null 2>&1 || { echo "✗ No encuentro 'docker'." >&2; exit 1; }

# Comando de compose: lo hereda de install.sh si nos invoca; si no, autodetecta.
if [ -z "${DC:-}" ]; then
  if docker compose version >/dev/null 2>&1; then DC="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
  else echo "✗ Falta Docker Compose." >&2; exit 1; fi
fi

# Usuario/BD: del .env si está, si no los defaults del compose.
PGUSER="noctcom"; PGDB="noctcom"
if [ -f .env ]; then
  v="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2- || true)"; [ -n "$v" ] && PGUSER="$v"
  v="$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2- || true)"; [ -n "$v" ] && PGDB="$v"
fi

# Espera a que Postgres acepte conexiones (tras 'up -d' tarda unos segundos).
echo "→ Esperando a que Postgres esté listo…"
ready=0
for _ in $(seq 1 60); do
  if $DC exec -T postgres pg_isready -U "$PGUSER" -d "$PGDB" >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 2
done
[ "$ready" = "1" ] || { echo "✗ Postgres no respondió a tiempo. Reintenta: bash scripts/selfhost-db-sync.sh" >&2; exit 1; }

# Aplica TODOS los parches de paridad en orden. Son ficheros 0N_*parity.sql
# idempotentes; añadir uno nuevo (07, 08…) lo recoge sin tocar este script.
echo "→ Aplicando paridad de schema a la BD '$PGDB' (usuario '$PGUSER')…"
for f in $(ls docker/postgres/init/*parity*.sql 2>/dev/null | sort); do
  base="$(basename "$f")"
  echo "   · $base"
  $DC exec -T postgres \
    psql -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 \
    -f "/docker-entrypoint-initdb.d/$base"
done

echo "✓ Schema sincronizado con la nube."
