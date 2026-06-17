# Recuperación ante desastres — procedimiento de restore

> Un backup que nunca se ha restaurado no es un backup. Este documento describe
> cómo restaurar Noctcom desde cero y cómo verificar que la copia es buena.
> **Ejecutado y verificado por última vez: 4 de junio de 2026** (ver al final).

Noctcom tiene dos almacenes de estado que hay que restaurar por separado:

1. **PostgreSQL** — metadatos: usuarios, bóvedas, árbol de nodos, versiones,
   referencias a chunks, sesiones. Todo cifrado en reposo a nivel de columna
   (el servidor no puede leer nombres ni contenido). En cloud: **Neon**.
2. **Almacenamiento de objetos (S3/B2)** — los blobs cifrados de cada chunk.
   En cloud: **Backblaze B2**. Las rutas viven en `chunks.s3_key`.

Ambos deben ser **coherentes en el tiempo**: una fila de `chunks` apunta a un
blob por `s3_key`. Si restauras una DB más nueva que el bucket (o al revés),
habrá referencias colgando. Restaura ambos al punto temporal más cercano.

---

## 0. Self-host (Docker/LXC): copia y restauración en un comando

En una instalación self-host (la que hace `install.sh`), los dos almacenes viven
en volúmenes Docker del propio servidor: **PostgreSQL** (`postgres_data`) y los
**blobs cifrados** (`minio_data` y/o `blob_data`, más cualquier disco de
`EXTRA_DATA_DIR`). Hay dos scripts que los copian **coherentes entre sí** (todo
del mismo instante) y los restauran:

```bash
# Crear una copia (queda en ./backups/noctcom-backup-<fecha>.tar.gz)
bash scripts/backup.sh

# Restaurar desde una copia (DESTRUCTIVO: pide escribir RESTAURAR)
bash scripts/restore.sh backups/noctcom-backup-AAAAMMDD-HHMMSS.tar.gz
```

- `backup.sh` hace `pg_dump` de la base de datos y empaqueta los volúmenes de
  blobs en un único `.tar.gz` con marca de tiempo; conserva las últimas 7 copias
  (`NOCTCOM_BACKUP_KEEP`) y acepta `NOCTCOM_BACKUP_DIR` para el destino.
- `restore.sh` recrea la base de datos, reemplaza el contenido de los volúmenes y
  reinicia el stack. Como DB y blobs salen del mismo backup, quedan coherentes.
- **En Proxmox**, ejecútalos dentro del LXC:
  `pct exec <CTID> -- bash -lc 'cd /opt/noctcom && bash scripts/backup.sh'`.
- **Guarda las copias fuera del servidor** (otro disco/equipo). Van cifradas a
  nivel de usuario, pero trátalas como sensibles igualmente.
- **Automatizar (cron diario, 3:15):**
  `15 3 * * * cd /opt/noctcom && bash scripts/backup.sh >> /var/log/noctcom-backup.log 2>&1`
- Además, en Proxmox conviene respaldar el **LXC entero** (Datacenter → Backup),
  que captura todo el contenedor de una vez.

> Verifica de vez en cuando que una copia restaura de verdad (sección 3): un
> backup que nunca se ha restaurado no es un backup.

---

## 1. Restaurar PostgreSQL

### 1a. Cloud (Neon)

Neon mantiene **point-in-time recovery** (historial de restore). Para volver a
un instante:

1. Consola de Neon → proyecto → *Branches* / *Restore*.
2. Crea una branch desde el timestamp deseado (o restaura la principal).
3. Actualiza `DATABASE_URL` en Render (env del servicio `noctcom-api`) si la
   restauración generó un endpoint nuevo, y redespliega.

### 1b. Desde un dump propio (self-host o copia fría)

```bash
# Dump (cliente de la MISMA major version que el servidor; Neon hoy = PG 17)
docker run --rm postgres:17-alpine pg_dump --no-owner --no-privileges "$DATABASE_URL" > dump.sql

# Restore en una instancia limpia
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 < dump.sql
```

> ⚠️ La major version del cliente `pg_dump` debe coincidir con la del servidor
> origen. PG 16 no puede volcar un servidor PG 17 (falla con "server version
> mismatch"). Usa `postgres:17-alpine` mientras Neon esté en PG 17.

## 2. Restaurar el almacenamiento de objetos

Backblaze B2 tiene versionado de objetos y *lifecycle*. Si el bucket sigue
intacto, no hay que hacer nada: las `s3_key` de la DB ya apuntan ahí. Si hubo
borrado, restaura las versiones desde la consola de B2 o re-sincroniza desde
una copia con `aws s3 sync` apuntando al endpoint de B2.

El bucket de prod, endpoint y región están en el `.env` del backend
(`S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`). **Nunca** en el repo.

---

## 3. Verificación de la copia (el paso que la gente se salta)

Tras restaurar, comprobar que DB y blobs son coherentes. Procedimiento usado el
4 jun 2026 (todo solo-lectura contra prod, restore en contenedor efímero):

```bash
# 1. Dump de prod a un contenedor PG 17 efímero
docker run -d --name restore-test -e POSTGRES_PASSWORD=x -e POSTGRES_DB=restore postgres:17-alpine
docker run --rm postgres:17-alpine pg_dump --no-owner --no-privileges "$DATABASE_URL" \
  | docker exec -i restore-test psql -U postgres -d restore -v ON_ERROR_STOP=0

# 2. Sanidad: la copia tiene las tablas y filas esperadas
docker exec restore-test psql -U postgres -d restore -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

# 3. Coherencia DB↔objetos: que cada blob de un archivo VIVO exista en B2
#    (HEAD de cada chunks.s3_key contra el endpoint, con credenciales S3)
docker run --rm -e AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY -e AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY \
  -e AWS_DEFAULT_REGION=$S3_REGION amazon/aws-cli \
  s3api head-object --endpoint-url $S3_ENDPOINT --bucket $S3_BUCKET --key "<s3_key>"

# 4. Limpieza: ¡el dump y la copia contienen datos reales!
docker rm -f restore-test
```

**Criterio de éxito:** el dump restaura sin errores fatales, los conteos de
tablas son razonables, y **todo blob referenciado por un nodo no borrado
existe en el bucket**. Un blob faltante solo es aceptable si pertenece a un
nodo borrado (ver hallazgo de abajo).

---

## Resultado del último simulacro (4 jun 2026)

- **Dump**: 140 KB, restaurado en PG 17 efímero **sin un solo error**.
- **Sanidad**: 19 tablas, 27 claves foráneas, conteos coherentes (1 usuario,
  1 bóveda, 9 nodos, 3 chunks).
- **Blobs en B2**: los 2 chunks de archivos reales (uno en papelera) → **OK**.
  El 3.º dio 404, y el diagnóstico es **benigno**: pertenece a una versión de
  un nodo **borrado** (`deleted_at` puesto, `current_version_id` NULL) — al
  borrar el archivo se purgó el blob de B2 correctamente, pero quedaron las
  filas `file_versions` + `chunks` sin limpiar. **No es pérdida de datos.**
- **Conclusión: B3 cerrado.** El backup es restaurable y coherente para todo
  el dato vivo.

### Deuda detectada (no bloqueante)

El borrado de un nodo purga su blob pero deja filas huérfanas en
`file_versions` y `chunks`. Candidato a ampliar `janitor.ts`: barrer versiones
no referenciadas por ningún `nodes.current_version_id` cuyo nodo esté borrado.
Hoy solo es cruft de BD (no cuenta como dato perdido ni, tras el borrado,
ocupa B2).
