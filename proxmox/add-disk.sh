#!/usr/bin/env bash
#
# Noctcom — Proxmox VE: dedicar un disco del host a un LXC de Noctcom
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/add-disk.sh)
#
# Ejecutar COMO ROOT EN EL HOST Proxmox VE (no dentro del LXC).
#
# Por qué este script: un LXC NO PRIVILEGIADO no ve los discos físicos del host
# (lsblk dentro del contenedor no lista /dev/sdX) ni tiene permisos para
# formatear/montar (CAP_SYS_ADMIN). Por eso el panel «Almacenamiento» de la web
# aparece vacío dentro de Proxmox. La forma correcta —y la que aplica este
# script— es preparar el disco EN EL HOST y pasarlo al LXC como punto de montaje
# (pct set -mpN). Luego se registra en EXTRA_DATA_DIR para que el backend lo use.
#
# El script:
#   1. Elige el LXC de Noctcom (CTID).
#   2. Lista los discos/particiones del host (excluye los del sistema/PVE).
#   3. Te deja elegir uno y, si quieres, FORMATEARLO (ext4/xfs) — destructivo.
#   4. Lo monta en el host (/mnt/noctcom-<label>) y lo añade a /etc/fstab.
#   5. Lo engancha al LXC (pct set -mpN <host>,mp=<host>) y reinicia el LXC.
#   6. Añade la ruta a EXTRA_DATA_DIR del .env del LXC y reejecuta install.sh
#      (idempotente) para que el backend lo bind-monte y ajuste permisos.
#   7. Te recuerda registrarlo en la web (Almacenamiento) con ese mismo path.
#
# Variables de entorno opcionales:
#   NOCTCOM_CTID=120            ID del LXC (si no, lo pregunta / autodetecta)
#   NOCTCOM_DEVICE=/dev/sdb     dispositivo a usar (si no, lo pregunta)
#   NOCTCOM_FS=ext4|xfs         sistema de ficheros al formatear (por defecto ext4)
#   NOCTCOM_LABEL=datos         etiqueta/nombre del disco (alfanum, -, _; ≤12)
#   NOCTCOM_FORMAT=1            formatear sin preguntar (¡destructivo!)
#   NOCTCOM_MOUNTPOINT=/mnt/... punto de montaje en el host (por defecto /mnt/noctcom-<label>)
#   NOCTCOM_REF=main            rama/tag del repo para reejecutar install.sh
#   NOCTCOM_NONINTERACTIVE=1    no preguntar (requiere CTID y DEVICE por env)
set -euo pipefail

# ─── Marca y color ──────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\033[1m'; DIM=$'\033[2m'
  AC=$'\033[38;5;44m'; G=$'\033[1;92m'; Y=$'\033[33m'; O=$'\033[38;5;214m'; R=$'\033[01;31m'; N=$'\033[0m'
else
  B=""; DIM=""; AC=""; G=""; Y=""; O=""; R=""; N=""
fi
say()  { printf "%s\n" "$*"; }
info() { printf "${Y}•${N} %s\n" "$*"; }
ok()   { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${O}⚠${N} %s\n" "$*"; }
die()  { printf "${R}✗ %s${N}\n" "$*" >&2; exit 1; }
hr()   { printf "${DIM}────────────────────────────────────────────────────────${N}\n"; }

REF="${NOCTCOM_REF:-main}"

ask() { # ask <prompt> <default> <var>  (lee de /dev/tty aunque venga por tubería)
  local prompt="$1" default="$2" __var="$3" reply=""
  if [ "${NOCTCOM_NONINTERACTIVE:-0}" = "1" ] || [ ! -e /dev/tty ]; then
    printf -v "$__var" '%s' "$default"; return
  fi
  printf "${B}%s${N}${DIM}%s${N} " "$prompt" "${default:+ [$default]}" > /dev/tty
  read -r reply < /dev/tty || true
  printf -v "$__var" '%s' "${reply:-$default}"
}

confirm() { # confirm <pregunta>  → 0 sí / 1 no (defecto NO; en no-interactivo, NO)
  local q="$1" reply=""
  [ "${NOCTCOM_NONINTERACTIVE:-0}" = "1" ] && return 1
  [ -e /dev/tty ] || return 1
  printf "${B}%s${N} ${DIM}[s/N]${N} " "$q" > /dev/tty
  read -r reply < /dev/tty || true
  case "$reply" in [sS]|[sS][ií]|[yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

# ─── whiptail (TUI) ─────────────────────────────────────────────
USE_TUI=0
if [ "${NOCTCOM_NONINTERACTIVE:-0}" != "1" ] && { [ -t 0 ] || [ -e /dev/tty ]; }; then
  command -v whiptail >/dev/null 2>&1 && USE_TUI=1
fi
if [ "$USE_TUI" = "1" ] && [ -z "${NO_COLOR:-}" ]; then
  export NEWT_COLORS='root=,black
window=,black
border=brightcyan,black
title=brightcyan,black
textbox=white,black
listbox=white,black
actlistbox=black,brightcyan
button=black,brightcyan
actbutton=white,blue
entry=white,black
label=brightcyan,black
roottext=white,black'
fi
tui_menu() { # tui_menu <título> <texto> <alto> <items_de_menú...>
  local title="$1" text="$2" h="$3"; shift 3
  whiptail --title "Noctcom · $title" --menu "$text" "$h" 76 "$(( h - 8 ))" "$@" 3>&1 1>&2 2>&3 </dev/tty
}
tui_input() { whiptail --title "Noctcom · $1" --inputbox "$2" "${4:-9}" 70 "$3" 3>&1 1>&2 2>&3 </dev/tty ; }

printf '\n'
printf '%s\n' "${AC}${B}  Noctcom · añadir disco a un LXC${N}"
printf '%s\n' "${DIM}  Proxmox VE · prepara un disco del host y lo enchufa al contenedor${N}"
printf '\n'

# ─── 1. Requisitos ──────────────────────────────────────────────
say "${B}1. Comprobando el host Proxmox…${N}"
[ "$(id -u)" = "0" ] || die "Ejecútalo como root en el host Proxmox."
for c in pct lsblk findmnt blkid wipefs; do
  command -v "$c" >/dev/null 2>&1 || die "Falta '$c'. Ejecuta este script EN EL HOST Proxmox VE."
done
ok "Host Proxmox VE detectado"

# ─── 2. Elegir el LXC (CTID) ────────────────────────────────────
say ""
say "${B}2. Contenedor de Noctcom…${N}"
CTID="${NOCTCOM_CTID:-}"
if [ -z "$CTID" ]; then
  # LXC etiquetados 'noctcom' (los crea noctcom-lxc.sh). Si no hay tags, todos.
  mapfile -t NC < <(pct list 2>/dev/null | awk 'NR>1 && $0 ~ /noctcom/ {print $1}')
  [ "${#NC[@]}" -eq 0 ] && mapfile -t NC < <(pct list 2>/dev/null | awk 'NR>1 {print $1}')
  [ "${#NC[@]}" -gt 0 ] || die "No encuentro ningún LXC. Crea uno con noctcom-lxc.sh primero."
  if [ "${#NC[@]}" -eq 1 ]; then
    CTID="${NC[0]}"
    info "Único LXC candidato: #$CTID"
  elif [ "$USE_TUI" = "1" ]; then
    MENU=(); for id in "${NC[@]}"; do
      MENU+=("$id" "$(pct exec "$id" -- hostname 2>/dev/null || echo '?')")
    done
    CTID="$(tui_menu "Contenedor" "¿En qué LXC quieres añadir el disco?" 16 "${MENU[@]}")" \
      || die "Cancelado."
  else
    say "  LXC disponibles: ${NC[*]}"
    ask "   ID del contenedor (CTID):" "${NC[0]}" CTID
  fi
fi
pct status "$CTID" >/dev/null 2>&1 || die "No existe el LXC #$CTID."
# ¿Está Noctcom dentro? (no es fatal, pero avisamos)
if ! pct exec "$CTID" -- test -f /opt/noctcom/.env 2>/dev/null; then
  warn "No veo /opt/noctcom/.env en el LXC #$CTID. ¿Seguro que es la instancia de Noctcom?"
  confirm "¿Continuar de todos modos?" || die "Cancelado."
fi
# Mapeo de UID: en LXC no privilegiado, root del contenedor = uid 100000 del host.
UNPRIV=1
pct config "$CTID" 2>/dev/null | grep -qE '^unprivileged: 0' && UNPRIV=0
if [ "$UNPRIV" = "1" ]; then UID_OFFSET=100000; else UID_OFFSET=0; fi
ok "LXC #$CTID seleccionado ($([ "$UNPRIV" = 1 ] && echo 'no privilegiado' || echo 'privilegiado'))"

# ─── 3. Detectar discos del host ────────────────────────────────
say ""
say "${B}3. Discos del host…${N}"
# Conjunto de dispositivos del SISTEMA/PVE: los que sostienen /, /boot, /boot/efi
# (y sus discos base). Nunca los ofrecemos para formatear.
sys_names() {
  local mp src
  for mp in / /boot /boot/efi; do
    src="$(findmnt -no SOURCE "$mp" 2>/dev/null)" || continue
    [ -n "$src" ] || continue
    lsblk -nso NAME "$src" 2>/dev/null || true
  done | sort -u
}
SYS="$(sys_names)"
is_system() { # is_system <ruta /dev/...>  → 0 si toca un disco del sistema
  local kn
  while read -r kn; do
    [ -z "$kn" ] && continue
    printf '%s\n' "$SYS" | grep -qx "$kn" && return 0
  done < <(lsblk -nso NAME "$1" 2>/dev/null)
  return 1
}

# Candidatos: discos y particiones, excluyendo sistema, miembros de LVM/ZFS/LUKS
# (en uso por PVE) y loop/rom. Consultamos cada dispositivo por separado (con -d)
# para no depender del orden de columnas cuando FSTYPE/MOUNTPOINT van vacíos.
human() { # bytes → tamaño legible
  if command -v numfmt >/dev/null 2>&1; then numfmt --to=iec "$1" 2>/dev/null && return; fi
  awk -v b="$1" 'BEGIN{ if(b>=1099511627776) printf "%.1fT", b/1099511627776;
    else if(b>=1073741824) printf "%.0fG", b/1073741824;
    else if(b>=1048576) printf "%.0fM", b/1048576; else printf "%dB", b }'
}
DEVS=(); LABELS=()
while read -r name type; do
  case "$type" in disk|part) : ;; *) continue ;; esac
  fstype="$(lsblk -dno FSTYPE "$name" 2>/dev/null | head -1)"
  case "$fstype" in LVM2_member|zfs_member|crypto_LUKS|swap) continue ;; esac
  is_system "$name" && continue
  size="$(human "$(lsblk -dbno SIZE "$name" 2>/dev/null | head -1)")"
  mnt="$(lsblk -dno MOUNTPOINT "$name" 2>/dev/null | head -1)"
  model="$(lsblk -dno MODEL "$name" 2>/dev/null | head -1 | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  DEVS+=("$name")
  LABELS+=("$(printf '%s  %s  %s%s' "$size" "${fstype:-vacío}" "${mnt:-sin montar}" "${model:+  ·$model}")")
done < <(lsblk -rpno NAME,TYPE 2>/dev/null)

[ "${#DEVS[@]}" -gt 0 ] || die "No hay discos libres para usar. Conecta/añade un disco al host y reintenta. (Los discos del sistema y los ya usados por PVE/LVM/ZFS se omiten por seguridad.)"

DEVICE="${NOCTCOM_DEVICE:-}"
if [ -z "$DEVICE" ]; then
  if [ "$USE_TUI" = "1" ]; then
    MENU=(); for i in "${!DEVS[@]}"; do MENU+=("${DEVS[$i]}" "${LABELS[$i]}"); done
    DEVICE="$(tui_menu "Disco" "Elige el disco/partición a dedicar a Noctcom:\n(los del sistema y los usados por PVE no aparecen)" 18 "${MENU[@]}")" \
      || die "Cancelado."
  else
    say "  Discos disponibles:"
    for i in "${!DEVS[@]}"; do printf "   %2s) %-14s %s\n" "$((i+1))" "${DEVS[$i]}" "${LABELS[$i]}"; done
    ask "   Número del disco a usar:" "1" PICK
    idx=$(( PICK - 1 ))
    [ "$idx" -ge 0 ] 2>/dev/null && [ "$idx" -lt "${#DEVS[@]}" ] || die "Selección no válida."
    DEVICE="${DEVS[$idx]}"
  fi
fi
[ -b "$DEVICE" ] || die "No es un dispositivo de bloque válido: $DEVICE"
is_system "$DEVICE" && die "Ese dispositivo sostiene el sistema/PVE. No se puede usar."
CUR_FS="$(lsblk -dno FSTYPE "$DEVICE" 2>/dev/null | head -1 || true)"
ok "Disco elegido: $DEVICE ${DIM}(fs actual: ${CUR_FS:-vacío})${N}"

# ─── 4. ¿Formatear? ─────────────────────────────────────────────
say ""
say "${B}4. Formato…${N}"
DO_FORMAT=0
if [ "${NOCTCOM_FORMAT:-0}" = "1" ]; then
  DO_FORMAT=1
elif [ "$USE_TUI" = "1" ]; then
  CHOICE="$(tui_menu "Formato" "Disco $DEVICE (fs actual: ${CUR_FS:-vacío}).\n\n¿Qué hacemos?" 14 \
      "usar"     "Usar tal cual (NO formatea; debe tener ext4/xfs y datos compatibles)" \
      "formatear" "Formatear el disco (BORRA TODO su contenido)")" || die "Cancelado."
  [ "$CHOICE" = "formatear" ] && DO_FORMAT=1
else
  if [ -z "$CUR_FS" ]; then
    warn "El disco no tiene sistema de ficheros: hay que formatearlo."
    DO_FORMAT=1
  else
    confirm "Formatear $DEVICE (BORRA TODO)? Si dices no, se usará tal cual." && DO_FORMAT=1
  fi
fi

FS="${NOCTCOM_FS:-ext4}"
LABEL="${NOCTCOM_LABEL:-}"
if [ "$DO_FORMAT" = "1" ]; then
  if [ "$USE_TUI" = "1" ] && [ -z "${NOCTCOM_FS:-}" ]; then
    FS="$(tui_menu "Sistema de ficheros" "¿Qué sistema de ficheros?" 12 \
        "ext4" "Recomendado (compatible y estable)" \
        "xfs"  "Alternativa (grandes volúmenes)")" || die "Cancelado."
  fi
  case "$FS" in ext4|xfs) : ;; *) die "Sistema de ficheros no soportado: $FS (usa ext4 o xfs)." ;; esac
  command -v "mkfs.$FS" >/dev/null 2>&1 || die "Falta 'mkfs.$FS' en el host. Instálalo (p. ej. apt install xfsprogs)."
fi

if [ -z "$LABEL" ]; then
  DEF_LABEL="datos"
  if [ "$USE_TUI" = "1" ]; then
    LABEL="$(tui_input "Etiqueta" "Nombre/etiqueta del disco (alfanum, -, _; ≤12):" "$DEF_LABEL")" || die "Cancelado."
  else
    ask "   Etiqueta del disco (alfanum, -, _; ≤12):" "$DEF_LABEL" LABEL
  fi
fi
LABEL="$(printf '%s' "$LABEL" | tr -cd 'A-Za-z0-9_-' | cut -c1-12)"
[ -n "$LABEL" ] || die "Etiqueta vacía o no válida."

MOUNTPOINT="${NOCTCOM_MOUNTPOINT:-/mnt/noctcom-$LABEL}"

# Confirmación destructiva fuerte (estilo FormatDiskModal): repetir la etiqueta.
if [ "$DO_FORMAT" = "1" ] && [ "${NOCTCOM_FORMAT:-0}" != "1" ]; then
  say ""
  warn "Vas a FORMATEAR $DEVICE como $FS. ${R}Esto borra TODO su contenido de forma irreversible.${N}"
  if [ "$USE_TUI" = "1" ]; then
    whiptail --title "Noctcom · ⚠ Confirmar formateo" --yesno \
"Se BORRARÁ todo el contenido de:

    $DEVICE  →  $FS  (etiqueta: $LABEL)

y se montará en $MOUNTPOINT.

¿Formatear definitivamente?" 16 70 --defaultno </dev/tty || die "Cancelado."
  else
    ask "   Escribe la etiqueta '$LABEL' para confirmar el borrado:" "" CONF
    [ "$CONF" = "$LABEL" ] || die "La confirmación no coincide. Cancelado."
  fi
fi

# ─── 5. Preparar el disco (host) ────────────────────────────────
say ""
say "${B}5. Preparando el disco en el host…${N}"
# Desmonta si estuviera montado (en cualquier punto).
while read -r mp; do
  [ -n "$mp" ] || continue
  info "Desmontando $DEVICE de $mp…"
  umount "$DEVICE" 2>/dev/null || umount "$mp" 2>/dev/null || die "No pude desmontar $DEVICE ($mp). Ciérralo y reintenta."
done < <(lsblk -nro MOUNTPOINT "$DEVICE" 2>/dev/null | grep -v '^$' || true)

if [ "$DO_FORMAT" = "1" ]; then
  info "Limpiando firmas anteriores (wipefs)…"
  wipefs -a "$DEVICE" >/dev/null
  info "Formateando $DEVICE como $FS…"
  case "$FS" in
    ext4) mkfs.ext4 -F -L "$LABEL" "$DEVICE" >/dev/null 2>&1 ;;
    xfs)  mkfs.xfs  -f -L "$LABEL" "$DEVICE" >/dev/null 2>&1 ;;
  esac
  ok "Formateado ($FS, etiqueta $LABEL)"
else
  case "$CUR_FS" in
    ext4|xfs|ext3|ext2) ok "Se usa el sistema de ficheros existente ($CUR_FS)." ;;
    "") die "El disco no tiene sistema de ficheros y elegiste no formatear. Reintenta y elige formatear." ;;
    *)  die "El sistema de ficheros '$CUR_FS' no es directamente usable como volumen de datos Linux. Reintenta y formatea como ext4/xfs." ;;
  esac
fi

UUID="$(blkid -s UUID -o value "$DEVICE" 2>/dev/null || true)"
[ -n "$UUID" ] || die "No pude leer el UUID de $DEVICE tras prepararlo."

mkdir -p "$MOUNTPOINT"
# fstab idempotente por UUID (nofail: que un disco ausente no bloquee el arranque).
if ! grep -qs "UUID=$UUID" /etc/fstab; then
  printf 'UUID=%s  %s  %s  defaults,nofail  0  2\n' "$UUID" "$MOUNTPOINT" "$FS" >> /etc/fstab
  info "Añadido a /etc/fstab (UUID=$UUID → $MOUNTPOINT)"
fi
mount "$MOUNTPOINT" 2>/dev/null || mount "$DEVICE" "$MOUNTPOINT"
mountpoint -q "$MOUNTPOINT" || die "No se montó $MOUNTPOINT."
# Cesión al rango de UID del LXC: en no privilegiado, el dir debe pertenecer a
# uid 100000 (= root dentro del contenedor) para que install.sh pueda luego
# cederlo al usuario 'app' del backend. Si se queda como root del host, dentro
# del LXC aparece como 'nobody' y el backend no podría escribir.
chown "$UID_OFFSET:$UID_OFFSET" "$MOUNTPOINT"
ok "Montado en $MOUNTPOINT (dueño uid $UID_OFFSET para el LXC)"

# ─── 6. Enganchar al LXC (pct set -mp) ──────────────────────────
say ""
say "${B}6. Enganchando el disco al LXC #$CTID…${N}"
# ¿Ya está este punto de montaje en la config? (idempotente)
if pct config "$CTID" | grep -qE "^mp[0-9]+:.*[ ,]mp=$MOUNTPOINT(,|$)"; then
  ok "El LXC ya tiene $MOUNTPOINT como punto de montaje."
  REBOOT=0
else
  # Siguiente índice mpN libre.
  IDX=0
  while pct config "$CTID" | grep -qE "^mp$IDX:"; do IDX=$((IDX+1)); done
  pct set "$CTID" -mp$IDX "$MOUNTPOINT,mp=$MOUNTPOINT" >/dev/null
  ok "Añadido mp$IDX → $MOUNTPOINT"
  REBOOT=1
fi

if [ "$REBOOT" = "1" ]; then
  info "Reiniciando el LXC para aplicar el punto de montaje…"
  pct reboot "$CTID" >/dev/null 2>&1 || { pct stop "$CTID" >/dev/null 2>&1 || true; pct start "$CTID" >/dev/null; }
  # Espera a que el contenedor esté en marcha y vea el bind mount.
  for _ in $(seq 1 30); do
    pct status "$CTID" 2>/dev/null | grep -q running && \
      pct exec "$CTID" -- test -d "$MOUNTPOINT" 2>/dev/null && break
    sleep 2
  done
  pct exec "$CTID" -- test -d "$MOUNTPOINT" 2>/dev/null \
    || die "El LXC no ve $MOUNTPOINT tras reiniciar. Revisa 'pct config $CTID'."
  ok "El LXC ve $MOUNTPOINT"
fi

# ─── 7. EXTRA_DATA_DIR + reejecutar install.sh ──────────────────
say ""
say "${B}7. Registrando el disco en Noctcom…${N}"
# Añade el path a EXTRA_DATA_DIR del .env del LXC (sin duplicar) y reejecuta
# install.sh dentro del LXC: regenera docker-compose.disks.yml, lo enchufa a
# COMPOSE_FILE, reinicia el backend y cede el directorio al usuario 'app'.
pct exec "$CTID" -- env MP="$MOUNTPOINT" bash -c '
  set -e
  cd /opt/noctcom || { echo "no-noctcom"; exit 9; }
  cur="$(grep -E "^EXTRA_DATA_DIR=" .env 2>/dev/null | head -1 | cut -d= -f2- || true)"
  cur="${cur%\"}"; cur="${cur#\"}"
  case ",$cur," in
    *",$MP,"*) : ;;  # ya presente
    *) if [ -n "$cur" ]; then new="$cur,$MP"; else new="$MP"; fi
       if grep -qE "^EXTRA_DATA_DIR=" .env; then
         sed -i.bak -E "s|^EXTRA_DATA_DIR=.*|EXTRA_DATA_DIR=$new|" .env && rm -f .env.bak
       else
         printf "\nEXTRA_DATA_DIR=%s\n" "$new" >> .env
       fi ;;
  esac
' || die "No pude actualizar EXTRA_DATA_DIR en el .env del LXC."
ok "EXTRA_DATA_DIR del LXC incluye $MOUNTPOINT"

info "Reconciliando el stack (install.sh, idempotente; puede tardar)…"
pct exec "$CTID" -- env \
  LC_ALL=C.UTF-8 LANG=C.UTF-8 \
  NOCTCOM_DIR=/opt/noctcom \
  NOCTCOM_NONINTERACTIVE=1 \
  NOCTCOM_REF="$REF" \
  bash -c "curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/$REF/install.sh | bash" \
  || die "install.sh falló dentro del LXC. Entra con 'pct enter $CTID' y revisa /opt/noctcom."

# ─── Resumen ────────────────────────────────────────────────────
say ""
hr
printf "${G}${B}  Disco añadido al LXC #$CTID${N}\n"
hr
say "  Disco:        ${B}$DEVICE${N} ${DIM}($FS, etiqueta $LABEL)${N}"
say "  Montado en:   ${B}$MOUNTPOINT${N}  ${DIM}(host y LXC, mismo path)${N}"
say "  En Noctcom:   EXTRA_DATA_DIR del .env del LXC"
say ""
say "  ${Y}Último paso (en la web):${N} entra en ${B}Almacenamiento${N} y registra el volumen"
say "  con el path ${B}$MOUNTPOINT${N} (la misma ruta). Luego ya recibe subidas cifradas."
say ""
say "  ${DIM}Self-host gratis para siempre · AGPL-3.0 · https://noctcom.com${N}"
say ""
