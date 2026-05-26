# Modelo de amenazas de Noctcom

> Este documento describe **qué protege Noctcom y qué no**. Si tu modelo de amenaza personal excede lo que aquí se cubre, Noctcom no es la herramienta adecuada para ti — preferimos que lo sepas antes que después.

## 1. Activos protegidos

En orden de prioridad:

1. **Contenido de archivos** (plaintext, antes y después de cifrar)
2. **Nombres de archivos y rutas** (metadata estructural)
3. **Claves criptográficas** (master key, file keys, vault keys, identity/exchange privkeys)
4. **Contraseña maestra del usuario** (jamás transmitida)
5. **Frase de recuperación** (12 palabras BIP39)
6. **Identidad del usuario** (email, IP, patrones de uso)
7. **Disponibilidad del servicio** (uptime, integridad de la BD)

## 2. Adversarios considerados

### A1 — Operador malicioso de Noctcom
**Descripción:** un empleado, contratista o socio de Noctcom con acceso a infraestructura producción intenta leer datos de usuarios.

**Capacidades asumidas:**
- Acceso de lectura/escritura a PostgreSQL, MinIO, Redis
- Acceso a logs de aplicación
- Capacidad de modificar el código del backend
- Acceso al filesystem de los servidores

**Capacidades NO asumidas:**
- No puede modificar el código del frontend que ya se ejecuta en el navegador del usuario
- No puede inyectar JavaScript en sesiones activas sin que el usuario lo note (CSP + SRI)

### A2 — Atacante que obtiene un dump completo de la base de datos
**Descripción:** un breach técnico, una orden judicial, una desgracia operativa.

**Capacidades asumidas:**
- Acceso completo a todas las filas de PostgreSQL
- Acceso completo a todos los blobs de MinIO
- Tiempo y recursos ilimitados para análisis offline
- GPU clusters y rainbow tables

### A3 — Adversario en la red (MITM activo)
**Descripción:** ISP malicioso, WiFi público comprometido, BGP hijacking, autoridades en la ruta.

**Capacidades asumidas:**
- Intercepción y modificación de tráfico en tránsito
- Capacidad de presentar certificados TLS falsos si tienen acceso a una CA comprometida

### A4 — Coerción legal (NSL, gag order, court order)
**Descripción:** un gobierno obliga a Noctcom mediante proceso legal a entregar datos o insertar backdoors.

**Capacidades asumidas:**
- Capacidad de obligar a Noctcom a entregar lo que tenga
- Capacidad de obligar a Noctcom a no revelar la coerción

### A5 — Cliente comprometido (malware en el dispositivo)
**Descripción:** el dispositivo del usuario tiene malware, keylogger, RAT, o un atacante físico.

**Capacidades asumidas:**
- Acceso a memoria del navegador del usuario
- Capacidad de leer pulsaciones de teclado
- Acceso a localStorage / IndexedDB
- Screenshots silenciosos

## 3. Matriz de amenazas

| # | Amenaza | A1 | A2 | A3 | A4 | A5 |
|---|---------|----|----|----|----|-----|
| T1 | Leer contenido de archivos en claro | ✅ | ✅ | ✅ | ✅ | ❌ |
| T2 | Leer nombres de archivos en claro | ✅ | ✅ | ✅ | ✅ | ❌ |
| T3 | Obtener master key sin contraseña | ✅ | ✅ | ✅ | ✅ | ❌ |
| T4 | Crackear contraseña por fuerza bruta offline | n/a | ⚠️ | n/a | n/a | ❌ |
| T5 | Suplantar identidad de usuario | ✅ | ⚠️ | ✅ | ⚠️ | ❌ |
| T6 | Bloquear acceso al servicio | ❌ | n/a | ✅ | ❌ | n/a |
| T7 | Modificar archivos sin detección | ✅ | ⚠️ | ✅ | ✅ | ❌ |
| T8 | Inferir patrones de uso (tamaño, frecuencia) | ❌ | ❌ | ❌ | ❌ | ❌ |
| T9 | Forward secrecy ante compromiso futuro | ✅ | ✅ | ✅ | ⚠️ | ❌ |
| T10 | Identificar relaciones (quién comparte con quién) | ❌ | ❌ | ❌ | ❌ | n/a |

Leyenda:
- ✅ = mitigado / protegido
- ⚠️ = parcialmente protegido (ver notas)
- ❌ = NO protegido (out of scope o limitación conocida)
- n/a = adversario no aplica a esa amenaza

## 4. Detalle por amenaza

### T1, T2 — Contenido y nombres de archivos
**Mitigación:** todo el contenido y los nombres se cifran con XChaCha20-Poly1305 en el dispositivo del usuario, usando claves derivadas de la contraseña maestra mediante Argon2id. El servidor solo ve ciphertext + nonces + AAD.

**Limitación conocida:** el tamaño exacto de cada archivo cifrado es visible al servidor. Esto permite ataques de **fingerprinting de archivos conocidos** — si sabes que el manifiesto del Partido X tiene exactamente 47,302 bytes, puedes saber quién lo tiene aunque no puedas leerlo. → Roadmap v0.2: padding Padmé para reducir resolución.

### T3 — Master key
**Mitigación:** la MK se deriva en el navegador del usuario con Argon2id y nunca se transmite. Solo existe en memoria mientras la sesión está desbloqueada.

**Limitación:** un atacante con acceso a memoria del navegador (A5) puede leerla. No hay protección contra malware en el cliente.

### T4 — Fuerza bruta offline
**Parcialmente mitigado:** Argon2id con parámetros `OPSLIMIT_MODERATE` (3 iteraciones) y `MEMLIMIT_MODERATE` (256 MiB) hace que cada intento cueste ~0.5 segundos y 256 MiB de RAM en una CPU moderna. Esto significa:

- Contraseña de 8 caracteres alfanuméricos (~$10^{14}$ combinaciones): inviable
- Contraseña de 6 caracteres del diccionario común: viable en horas con cluster GPU
- Frase de 4 palabras (diceware): inviable

**El sistema NO protege a usuarios con contraseñas débiles.** Por eso forzamos longitud mínima y mostramos un strength meter durante el signup.

### T5 — Suplantación de identidad
**Mitigación:** firmas Ed25519 vinculan cada operación al `identity_private_key` del usuario, que está wrapped con la MK. Sin la MK no puedes firmar.

**Limitación bajo A4:** un gobierno podría obligar a Noctcom a presentar al usuario una clave pública diferente cuando otro usuario lo busque para compartir un archivo. → Roadmap v0.3: verificación de fingerprints out-of-band (TOFU + SAS, como Signal).

### T6 — Disponibilidad
**No protegido bajo A1/A4:** si Noctcom o un gobierno deciden cerrar tu cuenta, no podemos prevenirlo. Pero **los datos siguen siendo solo tuyos** — no podemos descifrarlos para nadie.

**Mitigación parcial:** AGPL-3.0 + builds reproducibles → cualquiera puede levantar su propia instancia.

### T7 — Modificación no detectada
**Mitigación:** cada chunk cifrado lleva un tag Poly1305 con AAD que vincula el chunk a su índice. Modificar un chunk hace que el descifrado falle. El `content_hash` del file_version es BLAKE2b sobre todos los chunks.

**Limitación:** el servidor podría servirte una versión vieja del archivo (rollback attack). → Roadmap v0.4: signed file version manifests con timestamps verificables.

### T8 — Patrones de uso
**NO mitigado.** El servidor ve:
- Cuándo subes y descargas (timestamps)
- Cuántos archivos tienes
- Estructura de carpetas (anidamiento, sin nombres)
- Con quién compartes (grafos de relación)

Esto es **fundamentalmente inevitable** sin oblivious RAM (Pung, Talek), que añade latencias 1000x. Si tu modelo de amenaza requiere ocultar metadatos de tráfico, considera Tor + un servicio onion.

### T9 — Forward secrecy
**Mitigación:** cada archivo tiene su propia `file_key` aleatoria. Si una `file_key` se compromete, otros archivos siguen seguros.

**Limitación:** si tu contraseña maestra se compromete *en el futuro*, todos los datos pasados se ven afectados. → Roadmap v0.5: rotación periódica de la MK con re-wrap de todas las claves wrappeadas.

### T10 — Grafo social
**NO mitigado.** Cuando compartes con un usuario, el servidor ve el `share` (sharer_id, shared_with_id, node_id). Aunque no puede leer qué compartes, ve el grafo. Esto es información útil para correlación.

## 5. Fuera de scope explícito

Las siguientes amenazas **NO** las cubre Noctcom y aceptarlas es condición para usar el servicio:

- **Malware/keylogger/RAT en tu dispositivo:** si tu OS está comprometido, no podemos hacer nada
- **Ataques físicos:** alguien con acceso físico a tu dispositivo desbloqueado puede leer tus archivos
- **Coerción al usuario (rubber-hose cryptanalysis):** si alguien te apunta con un arma y te pide tu contraseña, dásela; los archivos no valen más que tu vida
- **Deniability ante coerción:** Noctcom no implementa volúmenes ocultos tipo VeraCrypt. Si tienes una cuenta, es evidente que existe.
- **Comunicación en tiempo real:** Noctcom es almacenamiento, no mensajería. Para chat E2E usa Signal.
- **Anonimato de red:** no garantizamos ocultar tu IP. Si lo necesitas, usa Tor.

## 6. Supuestos criptográficos

Asumimos que las siguientes primitivas son seguras durante la vida útil esperada del producto:

| Primitiva | Asunción | Si se rompe |
|-----------|----------|-------------|
| Argon2id | Resistente a GPU/ASIC en 256 MiB | Contraseñas débiles crackeables |
| XChaCha20-Poly1305 | IND-CCA2 con nonces de 24 bytes | Confidencialidad e integridad rotas |
| Ed25519 | EUF-CMA bajo modelo discreto en curva edwards25519 | Suplantación de identidad posible |
| X25519 | DDH en curva25519 | Sealed boxes leíbles |
| BLAKE2b | Resistencia a colisiones de 256 bits | content_hash y email_hash débiles |

Si alguna de estas se rompe (ej. quantum computing real), **migraremos a primitivas post-quantum** (Kyber, Dilithium) mediante re-encryption masivo + rotación de claves. Es un evento de varios meses, no instantáneo.

## 7. Notas de implementación (Fases 10-11)

### Multi-dispositivo (Fase 10)
- Cada dispositivo genera su propio keypair X25519
- La clave privada del dispositivo se almacena localmente en localStorage (wrapped con MK)
- Los dispositivos se pueden revocar desde settings, lo que invalida todas sus sesiones
- Las vault keys se sincronizan via contraseña (password → MK → vault wrap key), no requieren transferencia device-to-device
- Nuevos dispositivos se notifican por WebSocket a los existentes

### Rate limiting distribuido (Fase 11)
- Rate limiting usa Redis como store compartido (fallback a in-memory si Redis no disponible)
- Contramedida contra ataques de fuerza bruta distribuidos

### Health check
- `GET /health` expone el estado de DB, Redis y S3
- Este endpoint es público y podría revelar información sobre la infraestructura a un adversario
- Mitigación: solo devuelve booleanos (up/down), no versiones ni detalles de conexión

## 8. Cambios al modelo de amenaza

Cualquier cambio significativo a este documento se anunciará con 30 días de antelación a usuarios activos. Histórico de versiones en `docs/THREAT_MODEL_CHANGELOG.md`.

**Versión actual:** v1.1
**Última revisión:** 25 de mayo de 2026
**Próxima revisión programada:** 25 de noviembre de 2026

---

*Si encuentras inconsistencias entre lo que afirma este documento y lo que hace el código, **el código es la verdad** y eso es un bug — repórtalo según `SECURITY.md`.*
