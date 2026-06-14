#!/usr/bin/env bash
#
# Noctcom — pasar una instalación LAN ya existente a HTTPS interno por IP.
#
#   bash scripts/selfhost-lan-https.sh [IP]
#
# Por qué: en http://<IP> el navegador desactiva Web Crypto (crypto.subtle /
# randomUUID), así que la app zero-knowledge no puede cifrar (login sin sesión,
# subidas y /seguridad rotas). Caddy emite un certificado interno para la IP y
# sirve https://<IP> → contexto seguro → Web Crypto disponible.
#
# Detecta la IP (o úsala como argumento), ajusta el .env y recrea Caddy. No
# reconstruye el frontend (usa rutas relativas). Seguro de re-ejecutar.
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
[ -f .env ] || { echo "✗ No encuentro .env en $DIR (¿la instalación está en otra carpeta?)" >&2; exit 1; }

IP="${1:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
[ -n "$IP" ] || { echo "✗ No pude detectar la IP. Indícala: bash scripts/selfhost-lan-https.sh <IP>" >&2; exit 1; }

# Escribe KEY=VALUE en .env (reemplaza si existe, añade si no).
upsert() {
  if grep -q "^$1=" .env; then
    sed -i "s,^$1=.*,$1=$2," .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

echo "→ Configurando HTTPS interno para https://$IP"
upsert CADDY_DOMAIN  "$IP"
upsert PUBLIC_URL    "https://$IP"
upsert FRONTEND_URL  "https://$IP"
upsert PUBLIC_API_URL ""   # vacío = la web usa rutas relativas (same-origin)
grep -q '^COMPOSE_FILE=.*docker-compose.lan.yml' .env \
  || upsert COMPOSE_FILE "docker-compose.yml:docker-compose.lan.yml"

echo "→ Recreando contenedores…"
docker compose up -d
docker compose restart caddy >/dev/null 2>&1 || true

echo
echo "✓ Listo. Entra en el navegador por:"
echo "      https://$IP"
echo
echo "  La 1ª vez el navegador avisará del certificado autofirmado (CA interna"
echo "  de Caddy): acéptalo (Avanzado → Continuar). Luego ya podrás registrarte."
echo
echo "  ¿No carga? mira los logs:  docker compose logs caddy --tail 30"
