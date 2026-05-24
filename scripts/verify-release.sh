#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# verify-release.sh — Verifica firmas de una release de Noctcom
#
# Uso:
#   ./scripts/verify-release.sh v0.1.0
#
# Requiere:
#   • cosign (https://docs.sigstore.dev/system_config/installation/)
#   • jq
#   • curl
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

VERSION="${1:?Uso: $0 <version>  (ej: v0.1.0)}"
REPO="${NOCTCOM_REPO:-noctcom/noctcom}"
REGISTRY="ghcr.io/${REPO}"

# Identidad esperada del workflow que firmó
EXPECTED_IDENTITY="https://github.com/${REPO}/.github/workflows/build.yml@refs/tags/${VERSION}"
EXPECTED_ISSUER="https://token.actions.githubusercontent.com"

color() {
  case "$1" in
    red)    echo -e "\033[31m$2\033[0m" ;;
    green)  echo -e "\033[32m$2\033[0m" ;;
    yellow) echo -e "\033[33m$2\033[0m" ;;
    cyan)   echo -e "\033[36m$2\033[0m" ;;
    bold)   echo -e "\033[1m$2\033[0m" ;;
  esac
}

step() { color cyan "→ $1"; }
ok() { color green "  ✓ $1"; }
err() { color red "  ✗ $1"; exit 1; }
info() { echo "    $1"; }

# ─── Pre-checks ──────────────────────────────────────────────────
step "Comprobando herramientas locales"
command -v cosign >/dev/null || err "cosign no instalado. https://docs.sigstore.dev"
command -v jq >/dev/null || err "jq no instalado"
command -v curl >/dev/null || err "curl no instalado"
ok "cosign $(cosign version --json 2>/dev/null | jq -r .GitVersion 2>/dev/null || echo '?')"

# ─── 1. Verificar imágenes Docker ────────────────────────────────
step "Verificando firmas de imágenes Docker"

for component in backend frontend; do
  IMAGE="${REGISTRY}-${component}:${VERSION}"
  info "Imagen: ${IMAGE}"

  if ! cosign verify \
       --certificate-identity "${EXPECTED_IDENTITY}" \
       --certificate-oidc-issuer "${EXPECTED_ISSUER}" \
       "${IMAGE}" > /tmp/cosign-${component}.json 2>/dev/null; then
    err "Firma inválida o ausente para ${IMAGE}"
  fi
  ok "${component}: firma verificada"
done

# ─── 2. Verificar SBOM ───────────────────────────────────────────
step "Verificando SBOM (Software Bill of Materials)"

for component in backend frontend; do
  IMAGE="${REGISTRY}-${component}:${VERSION}"

  if ! cosign verify-attestation \
       --type spdxjson \
       --certificate-identity "${EXPECTED_IDENTITY}" \
       --certificate-oidc-issuer "${EXPECTED_ISSUER}" \
       "${IMAGE}" > /tmp/sbom-${component}.json 2>/dev/null; then
    err "SBOM no verificable para ${component}"
  fi

  COUNT=$(jq '.payload' /tmp/sbom-${component}.json \
          | base64 -d \
          | jq '.predicate.packages | length' 2>/dev/null || echo "?")
  ok "${component}: SBOM con ${COUNT} paquetes verificada"
done

# ─── 3. Verificar especificación criptográfica ───────────────────
step "Verificando integridad de docs/CRYPTO_SPEC.md"

RELEASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"
TMPDIR=$(mktemp -d)
trap "rm -rf ${TMPDIR}" EXIT

curl -sL "${RELEASE_URL}/CRYPTO_SPEC.sig" -o "${TMPDIR}/CRYPTO_SPEC.sig" || err "No se pudo descargar la firma"
curl -sL "${RELEASE_URL}/CRYPTO_SPEC.cert" -o "${TMPDIR}/CRYPTO_SPEC.cert" || err "No se pudo descargar el cert"
curl -sL "https://raw.githubusercontent.com/${REPO}/${VERSION}/docs/CRYPTO_SPEC.md" -o "${TMPDIR}/CRYPTO_SPEC.md" || err "No se pudo descargar CRYPTO_SPEC.md"

if ! cosign verify-blob \
     --certificate "${TMPDIR}/CRYPTO_SPEC.cert" \
     --signature "${TMPDIR}/CRYPTO_SPEC.sig" \
     --certificate-identity "${EXPECTED_IDENTITY}" \
     --certificate-oidc-issuer "${EXPECTED_ISSUER}" \
     "${TMPDIR}/CRYPTO_SPEC.md" 2>/dev/null; then
  err "CRYPTO_SPEC.md falló verificación de firma"
fi
ok "CRYPTO_SPEC.md: firma verificada"
info "Hash BLAKE2b: $(b2sum -l 256 "${TMPDIR}/CRYPTO_SPEC.md" 2>/dev/null | cut -d' ' -f1 || sha256sum "${TMPDIR}/CRYPTO_SPEC.md" | cut -d' ' -f1)"

# ─── 4. Comprobar canary statement ───────────────────────────────
step "Comprobando warrant canary"

CANARY_URL="https://noctcom.com/canary"
LAST_UPDATE=$(curl -s "${CANARY_URL}" 2>/dev/null | grep -oP '\d{4}-\d{2}-\d{2}' | head -1 || echo "")

if [[ -z "${LAST_UPDATE}" ]]; then
  color yellow "  ⚠ Canary no accesible o sin fecha legible"
else
  DAYS_AGO=$(( ($(date +%s) - $(date -d "${LAST_UPDATE}" +%s)) / 86400 ))
  if [[ ${DAYS_AGO} -lt 60 ]]; then
    ok "Canary actualizado hace ${DAYS_AGO} días (último: ${LAST_UPDATE})"
  else
    color yellow "  ⚠ Canary stale: última actualización hace ${DAYS_AGO} días"
    info "Considera revisar https://noctcom.com/canary y los comunicados oficiales"
  fi
fi

# ─── Resumen ──────────────────────────────────────────────────────
echo ""
color bold "═══════════════════════════════════════════════════════════"
color green "✓ Release ${VERSION} verificada"
color bold "═══════════════════════════════════════════════════════════"
echo ""
echo "Lo que esta verificación garantiza:"
echo "  • Las imágenes Docker fueron construidas por GitHub Actions"
echo "  • Desde el commit del tag ${VERSION} del repo ${REPO}"
echo "  • La especificación criptográfica no fue alterada"
echo "  • El listado de dependencias (SBOM) está atestado"
echo ""
echo "Lo que NO garantiza:"
echo "  • Que el código del repo sea seguro (lee docs/CRYPTO_SPEC.md)"
echo "  • Que no haya backdoors lógicos (audita el código)"
echo "  • Que tu dispositivo no esté comprometido"
echo ""
