# Noctcom — Roadmap de fases

Última actualización: 25 mayo 2026

---

## Fase 1: Fundación y criptografía — COMPLETADA

Todo el modelo zero-knowledge está implementado y funcional.

- [x] Esquema de base de datos PostgreSQL (14 tablas, zero-knowledge design)
- [x] Primitivas criptográficas backend (Argon2id, XChaCha20-Poly1305, Ed25519, X25519, BLAKE2b)
- [x] Primitivas criptográficas frontend (mirror de backend con libsodium-wrappers-sumo)
- [x] Infraestructura Docker (PostgreSQL, MinIO, Redis, Caddy)
- [x] docker-compose.yml con health checks y volúmenes persistentes
- [x] docker-compose.override.yml para puertos dev (15432, 16379, 19000)
- [x] Inicialización de MinIO (bucket, versionado, lifecycle 30 días)
- [x] Configuración centralizada con validación de variables de entorno

---

## Fase 2: Autenticación — COMPLETADA

Signup, login y 2FA funcionan end-to-end con crypto real.

- [x] POST /signup — creación de cuenta con generación de claves y vault inicial
- [x] POST /login/init — challenge-response con mitigación de timing attacks
- [x] POST /login/finalize — verificación de firma Ed25519
- [x] POST /refresh — rotación de refresh tokens
- [x] POST /logout — revocación de sesión
- [x] GET /me — perfil del usuario autenticado
- [x] Rate limiting por ruta (signup=5/min, login=10/min, refresh=20/min)
- [x] Frontend signup: formulario → mnemónica BIP39 → verificación de 3 palabras → API
- [x] Frontend login: email + password → KDF → firma de challenge → TOTP opcional
- [x] TOTP 2FA completo (enable, verify, disable) con RFC 6238
- [x] Body limit 16KB en rutas de auth
- [x] Validación de tamaños criptográficos exactos (pubkeys=32B, nonces=24B, wrapped=48B)
- [x] Timing jitter (80-200ms) en comprobación de usuario existente
- [x] JWT con access + refresh tokens en localStorage

---

## Fase 3: Seguridad del frontend — COMPLETADA

Hardening de la capa de presentación.

- [x] Sanitización de inputs (XSS): sanitizeUsername, sanitizeEmail, sanitizeErrorMessage
- [x] maxLength en todos los campos (username=64, email=254, password=128)
- [x] Anti-paste en verificación de mnemónica
- [x] Debounce 2s en submit del signup
- [x] Limpieza post-signup: borra mnemónica, password y clipboard
- [x] Auto-clear clipboard 60s tras copiar mnemónica
- [x] MutationObserver en auth layout que elimina iframes/objects inyectados
- [x] CSP, COOP, X-XSS-Protection, X-Frame-Options en next.config.mjs

---

## Fase 4: Backend de archivos — COMPLETADA

Las rutas de gestión de archivos y uploads están implementadas.

- [x] CRUD de vaults (crear, listar)
- [x] CRUD de nodos (crear carpeta, listar, renombrar, mover, eliminar)
- [x] Soft delete (papelera)
- [x] Versionado de archivos
- [x] Upload zero-knowledge: init → presigned URLs → complete
- [x] Download: presigned URLs + metadatos cifrados
- [x] Quota enforcement por usuario
- [x] Sharing E2E con sealed boxes (crypto_box_seal)
- [x] Listar shares entrantes y salientes
- [x] Revocar shares
- [x] Detección de discos (Linux + Windows)

---

## Fase 5: Páginas públicas — COMPLETADA

- [x] Landing page con sección de features y self-host
- [x] /security — spec criptográfica + modelo de amenazas
- [x] Manual de usuario renderizado en markdown

---

## Fase 6: Integración frontend-backend — EN PROGRESO

Aquí es donde estamos. Las rutas backend existen, el frontend tiene la UI, y la conexión está avanzando.

- [x] Cliente HTTP con auto-refresh de JWT (lib/api.ts)
- [x] Signup conectado al backend (POST /signup funciona)
- [x] Login conectado al backend (init + finalize + TOTP)
- [x] **Vault store** (lib/vault-store.ts): Zustand store con init, loadNodes, createFolder, deleteNode, moveNode, uploadFiles, downloadFile, loadTrash, restoreNode, loadShares, revokeShare
- [x] **Vault file browser**: carga nodos reales de la API, descifra nombres y metadata con vault key
- [x] **Navegación de carpetas**: breadcrumb real, click para entrar, navegación arriba
- [x] **Crear carpetas**: cifra nombre + metadata (icono/color) con vault key, POST /nodes/folders
- [x] **Upload de archivos**: chunking 4 MiB, cifrado XChaCha20-Poly1305, presigned PUT a MinIO, content hash
- [x] **Download de archivos**: presigned GET, descifrado chunk a chunk, reconstrucción de blob
- [x] **Eliminar archivos**: soft delete con toast, drag & drop move entre carpetas
- [x] **Shared page**: carga shares entrantes/salientes desde API, revocar shares
- [x] **Trash page**: carga nodos eliminados desde API, restaurar desde papelera
- [x] **Settings storage**: muestra almacenamiento real desde GET /me
- [x] **Sidebar storage**: barra de progreso real con datos del API
- [x] **Backend trash/restore**: endpoints GET /vault/:vaultId/trash y POST /:id/restore
- [x] **Upload progress bar**: indicador flotante con progreso de cifrado/subida
- [ ] **Recovery**: la página tiene UI pero NO llama a /recovery/init ni /recovery/finalize (gap de diseño: mnemónica no está vinculada a identity key)
- [ ] **Compartir archivos**: UI de selección de usuario + sealed key aún no implementada
- [ ] **Páginas vacías**: recent, starred, activity — necesitan endpoints backend adicionales

---

## Fase 7: Completar flujos críticos — EN PROGRESO

Funcionalidades que ya tienen backend pero necesitan cierre completo.

- [x] Cifrado/descifrado de archivos en frontend (completado en Fase 6)
- [x] Conectar vault page con API de nodos (completado en Fase 6)
- [x] Upload/download real con chunking + presigned URLs (completado en Fase 6)
- [x] Recovery frontend conectado a API con mnemónica → recovery key real
- [x] Validación de signup corregida (Ed25519 privkey = 64 bytes, no 32)
- [x] Implementar share real: ShareModal con lookup usuario → sealed key (crypto_box_seal) → POST /shares
- [x] Integrar envío de email en signup (nodemailer + Mailtrap, fire-and-forget)
- [x] Crear ruta POST /auth/verify + página /verify con campo de código
- [ ] Completar WebAuthn authenticate/finish (verificación de firma)
- [ ] UI de detección de discos en settings (endpoint GET /storage/disks existe)

---

## Fase 8: Funcionalidades del vault — COMPLETADA

Páginas secundarias del vault con datos reales.

- [x] /vault/recent — archivos por fecha de modificación (GET /nodes/vault/:id/recent)
- [x] /vault/starred — favoritos con toggle (DB column + PATCH /nodes/:id/star + GET starred)
- [x] /vault/shared — shares entrantes/salientes con API (completado en Fase 6)
- [x] /vault/activity — audit log cifrado E2E (POST/GET /audit, descifrado client-side con HKDF)
- [x] /vault/trash — nodos eliminados, restaurar (completado en Fase 6)
- [x] /vault/settings — almacenamiento real desde GET /me (completado en Fase 6)
- [x] Toggle de estrella en vault cards (hover → click estrella)
- [x] Logging automático de acciones: upload, delete, share, folder_create → audit_log cifrado
- [x] Búsqueda de archivos (client-side sobre nombres descifrados, ya funciona en vault page)
- [ ] Previsualización de archivos (imágenes, texto, PDF descifrados en memoria) — futuro

---

## Fase 9: Tiempo real y sync — COMPLETADA

- [x] Redis pub/sub integrado en WebSocket (subscriber dedicado por conexión)
- [x] Notificaciones de cambios: nodes (create/delete/move/upload), shares (create/receive), storage (update)
- [x] Publish automático en: nodes.ts, uploads.ts, shares.ts → Redis → WS → cliente
- [x] Frontend useSync hook: conecta WS con JWT, reconexión automática, reload automático de nodos/storage
- [x] Sync entre pestañas del navegador vía BroadcastChannel API
- [x] CSP actualizado para permitir ws://localhost:3000

---

## Fase 10: Multi-dispositivo — COMPLETADA

- [x] Flujo de registro de dispositivos: login en nuevo browser genera device X25519 keypair y lo registra via POST /auth/devices
- [x] Intercambio de claves entre dispositivos vía X25519 (device keypair generado, privkey wrapped con MK en localStorage)
- [x] Backend CRUD de dispositivos: GET (listar), POST (registrar), DELETE (revocar), DELETE / (revocar todos), PATCH /:id/rename
- [x] Gestión de dispositivos en settings: lista real con nombres descifrados, revocar individual, cerrar todas las sesiones
- [x] Sincronización de vault keys entre dispositivos (via password → MK → vault key unwrap, sin transferencia device-to-device)
- [x] Login/finalize valida deviceId del cliente, actualiza last_seen_at
- [x] Notificaciones WebSocket: device:new (toast), device:revoked (logout forzado si es el actual)
- [x] deviceId persistido en localStorage, limpiado en logout

---

## Fase 11: Producción — COMPLETADA

- [x] Configuración de Caddy para TLS y reverse proxy (Caddyfile con HSTS, CSP, HTTP/2+3, WebSocket)
- [x] Variables de entorno de producción (.env.example completo con SMTP, generadores de secretos)
- [x] Rate limiting con Redis (custom RedisRateLimitStore, fallback a in-memory si Redis no disponible)
- [x] Logs estructurados (pino JSON en producción, request IDs via X-Request-Id o randomUUID)
- [x] Health check profundo (GET /health verifica DB, Redis, S3 — devuelve ok/degraded)
- [x] Documentación de self-hosting (SELFHOST.md con guía paso a paso, arquitectura, backups)
- [x] Dockerfiles backend y frontend (multi-stage builds, standalone Next.js output)
- [x] .dockerignore para optimizar build context
- [x] Graceful shutdown (SIGTERM/SIGINT → close server, pool, redis)
- [x] SMTP configurable via env (ya no depende de Mailtrap hardcoded, cualquier SMTP compatible)
- [x] docker-compose.yml con SMTP vars y build args para frontend

---

## Fase 12: Hardening y auditoría — COMPLETADA

- [x] Tests unitarios de criptografía backend (36 tests: AEAD, key wrapping, keypairs, signatures, sealed boxes, email hash, content hash, file chunking, recovery, encoding)
- [x] Tests de integración backend (10 tests: signup flow, login challenge-response, share Alice→Bob, file upload/download multi-chunk, recovery flow, vault key chain completa)
- [x] Tests unitarios de criptografía frontend (28 tests: AEAD, JSON encryption, KDF, deriveSubKey, keypairs, sealed boxes, email hash, toBase32 RFC 4648, TOTP, chunk decryption, encoding)
- [x] Fix bug criptográfico: email hash namespace unificado a `noctcom.email.v1` (backend tenía `cryptvault.email.v1`)
- [x] Revisión de CSP y headers: COOP header añadido a Caddyfile, object-src/form-action añadidos al CSP
- [x] Documentación de modelo de amenazas actualizada a v1.1 (multi-dispositivo, rate limiting Redis, health check)
- [x] SECURITY.md actualizado (fechas, canary statement)
- [ ] Auditoría de seguridad externa — pendiente de financiación
- [ ] Penetration testing — pendiente de financiación

---

## Fase 13: Discos físicos (USB, SATA) — COMPLETADA

- [x] Tabla `storage_volumes` en DB para registrar discos como volúmenes de almacenamiento
- [x] Columnas `storage_type` y `volume_id` en tabla `chunks` para soporte multi-backend (S3 o disco)
- [x] Módulo `storage/disk.ts`: writeToDisk, readFromDisk, deleteFromDisk con protección path traversal
- [x] CRUD de volúmenes: POST/GET/PATCH/DELETE `/storage/volumes`
- [x] Detección de discos (`GET /storage/disks`) marca activos los discos configurados como volúmenes
- [x] Upload a disco: backend recibe chunks cifrados via PUT `/uploads/chunk/:id`, escribe en filesystem
- [x] Download desde disco: GET `/uploads/chunk/:id/data` sirve chunks desde filesystem
- [x] Delete desde disco: limpieza de blobs al eliminar versiones
- [x] Selección automática de backend: si hay volumen activo → disco, sino → MinIO
- [x] UI en settings: sección "Discos de almacenamiento" con discos detectados, añadir, activar/desactivar, eliminar
- [x] Frontend vault-store: upload adaptativo — usa apiFetch para chunks de disco, presigned URL para S3
- [ ] Formatear discos desde la app — pendiente (requiere permisos root/admin, riesgo alto)

## Resumen de progreso

| Fase | Estado | Progreso |
|------|--------|----------|
| 1. Fundación y criptografía | Completada | 100% |
| 2. Autenticación | Completada | 100% |
| 3. Seguridad frontend | Completada | 100% |
| 4. Backend de archivos | Completada | 100% |
| 5. Páginas públicas | Completada | 100% |
| 6. Integración frontend-backend | En progreso | ~80% |
| 7. Completar flujos críticos | En progreso | ~80% |
| 8. Funcionalidades del vault | Completada | ~95% |
| 9. Tiempo real y sync | Completada | 100% |
| 10. Multi-dispositivo | Completada | 100% |
| 11. Producción | Completada | 100% |
| — | — | — |
| **Push notifications (FCM)** | Futuro | Integrar Firebase Cloud Messaging para notificar shares, actividad sospechosa cuando la app está cerrada |
| 12. Hardening y auditoría | Completada | ~90% |

**Progreso global estimado: ~70%**

El core criptográfico y el backend están sólidos. El trabajo restante es principalmente integración frontend-backend, UI funcional y preparación para producción.
