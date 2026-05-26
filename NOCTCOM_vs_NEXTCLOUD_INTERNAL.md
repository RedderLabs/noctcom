# Noctcom vs Nextcloud — Memo interno

> **Confidencial · No publicar.**
> Documento de referencia para mantener la brújula clara mientras construyo Noctcom.
> Releer cuando esté tomando decisiones de diseño dudosas o cuando dude del propósito del proyecto.

**Última revisión:** 25 de mayo de 2026
**Próxima revisión:** cuando llegue a 100 usuarios, o cuando dude de por qué sigo construyendo esto.

---

## 🎯 La pregunta única que justifica este proyecto

> **¿Es Noctcom "Nextcloud pero cifrado"?**
>
> No. Es algo mucho más estrecho y radical.

La diferencia no es feature-by-feature. Es filosófica:

| Nextcloud | Noctcom |
|---|---|
| Trata el cifrado como **feature opcional** sobre una plataforma de archivos | Trata el cifrado como **invariante del sistema** |
| Es posible operar sin E2E (es lo común). El cifrado se añade encima | No existe modo "sin cifrar". La master key es prerequisito para CUALQUIER operación |
| Arquitectura asume servidor que ve plaintext en muchos paths | Arquitectura asume servidor que ve ciphertext en TODOS los paths |

**Cuando dude de una decisión de diseño, vuelvo a esta tabla.** Si la opción A implica que "en algún caso el servidor podría ver plaintext", está mal. Punto. No hay "pero es más cómodo" que valga.

---

## 📊 Diferencias técnicas reales (la chuleta)

### Capa criptográfica

| Dimensión | Nextcloud | Noctcom |
|-----------|-----------|---------|
| Cifrado E2E por defecto | No (plugin opcional, muy poca gente lo activa) | Sí, obligatorio |
| Nombres de archivos | En claro en BD incluso con E2E | Cifrados con vault_key |
| Metadatos (mime, size, tags) | En claro | Cifrados en metadata_encrypted |
| KDF del password | bcrypt o PBKDF2 (varía) | Argon2id MODERATE (256 MiB, 3 ops) |
| AEAD del contenido | AES-256-GCM | XChaCha20-Poly1305 con AAD por chunk |
| Chunking | Variable, sin AAD vinculado al índice | 4 MiB fijo con AAD chunk:N |
| Compartir E2E | Limitado y problemático en E2E v2 | Sealed boxes X25519 nativos |
| Recuperación de password | El admin puede resetear (y leer) | Frase BIP39; si la pierdes, datos irrecuperables |

### Arquitectura

| Dimensión | Nextcloud | Noctcom |
|-----------|-----------|---------|
| Stack base | PHP + Apache/Nginx | Node.js (Fastify) + TypeScript |
| Subida de archivos | Pasan por backend antes de storage | Presigned URLs directas a MinIO/S3 |
| Tamaño del codebase | ~500.000+ líneas | ~10.000 líneas |
| Auditabilidad práctica | Muy difícil (mucho código, deps, plugins) | Razonable (crypto/index.ts en una tarde) |
| Builds reproducibles | No por defecto | Sí, cosign keyless via Sigstore |
| SBOM atestado | No | Sí, en cada release |

### Modelo operativo

| Dimensión | Nextcloud | Noctcom |
|-----------|-----------|---------|
| Filosofía | "Suite completa de productividad" | "Sólo storage. Pero hecho bien" |
| Audiencia | Empresas sustituir M365 | Individuos/equipos paranoicos |
| Configuración | Compleja, requiere sysadmin | docker compose up |
| Surface area de ataque | Enorme (cada app es vector) | Mínima (storage + auth) |
| Quién puede leer archivos | Admin del servidor en muchos escenarios | Nadie excepto el usuario |

---

## ⚠️ Las desventajas reales que NO debo negar

Si me convenzo de que Noctcom es "mejor en todo", estoy mintiéndome y voy a tomar malas decisiones. Estas son las trade-offs honestas:

1. **Nextcloud es ecosistema, Noctcom es feature.**
   Mail, calendario, contactos, oficina colaborativa, chat, formularios. Yo sólo guardo archivos. Esto NO debe cambiar — la tentación de "añadir calendario porque la gente lo pide" es la muerte del proyecto.

2. **Nextcloud tiene 7+ años de bugs encontrados.**
   Mi v0.1 tiene 6 semanas. Errores que ningún diseño teórico predice. **Asumir esto en cada release. No prometer estabilidad de production-grade hasta tener miles de horas de uptime real.**

3. **Nextcloud tiene comunidad enorme.**
   600k+ instancias, plugins, traducciones, sysadmins que saben operarlo. Yo tengo un repo recién publicado. **Construir comunidad antes que features.**

4. **Nextcloud está auditado** por Cure53, BSI, etc. Noctcom no.
   **Esto es deuda crítica. Hasta que no tenga audit profesional, cada claim criptográfico debe llevar disclaimer.**

5. **Recuperación más amigable en Nextcloud.**
   Admin puede transferir/rescatar archivos de empleados que se van. En Noctcom: pierdes password + mnemónica = datos perdidos. **Brutal para corporate. Asumir que descarto ese mercado.**

6. **Nextcloud escala a miles de usuarios bien probado.**
   Mi sistema no se ha estresado nunca. **Antes de marketing a empresas grandes: load testing serio.**

7. **Nextcloud tiene clientes desktop y móvil maduros.**
   Yo sólo tengo web. **La app móvil RN está vacía. Sin móvil decente, mi mercado real es muy pequeño.**

---

## 🚫 Cuándo NO es Noctcom la respuesta correcta

Cuando un usuario potencial me describa estos casos, debo **recomendarle Nextcloud** (o Proton Drive). Mentirles para conseguir un usuario más me explota en la cara después:

- Empresa de 50+ personas con compliance y workflows complejos → Nextcloud
- Necesita calendario + mail + storage en un paquete → Nextcloud o Proton
- Admin necesita poder rescatar archivos de empleados → Nextcloud
- Quiere reemplazar Microsoft 365 entero → Nextcloud
- No le importa que el operador pueda acceder técnicamente → cualquiera

**Decir "no" en estos casos genera más confianza que decir "sí" forzado.**

---

## ✅ Cuándo Noctcom gana claramente

Estos son los usuarios para los que estoy construyendo. Todo el roadmap debe priorizar mejorar SU experiencia, no atraer a los otros:

- Personas/equipos pequeños paranoicos con privacidad
- Periodistas, investigadores, abogados de derechos humanos
- Quien vive en jurisdicción donde operador puede ser obligado a entregar
- Quien sólo necesita storage, no toda la suite
- Quien valora simplicidad de auditoría sobre cantidad de features
- Quien quiere self-hostear algo que pueda leer en una semana

---

## 🎙️ El argumento que defenderé públicamente

Cuando alguien me diga "¿por qué no usar Nextcloud?", esta es la respuesta no-vendida-aire:

> "Nextcloud es mejor en casi todo. Excepto en una cosa que para algunos usuarios es la única que importa: la imposibilidad técnica de que tú, como operador, accedas a los datos. Si eso no es crítico para ti, quédate con Nextcloud — es más maduro y completo. Si esa propiedad es no-negociable, Nextcloud no la cumple del todo y Noctcom sí. Punto."

**Noctcom NO es "el Nextcloud que sí cifra". Es una herramienta más estrecha pero más estricta para un caso de uso específico.**

---

## 🤐 Verdades que sé pero que probablemente nunca diré en público

Estas son cosas que sé y que no voy a poner en marketing. Pero las tengo aquí para no auto-engañarme:

### 1. Para el 95% de los usuarios, Nextcloud es la elección correcta.

El cifrado adicional de Noctcom NO compensa pérdida de features, madurez y ecosistema para la mayoría. Sólo el 5% paranoico/alto riesgo gana realmente.

**Implicación operativa:** mi mercado real es estrechísimo. No debo construir asumiendo crecimiento de masa. Mejor 100 usuarios devotos que 10.000 indiferentes que se irán al primer bug.

### 2. Nextcloud podría matarme en 6 meses.

Si deciden que el E2E con nombres cifrados es prioritario, tienen recursos, comunidad y ya están a medio camino. La ventana competitiva existe porque ellos no priorizan esto, no porque sea técnicamente imposible para ellos.

**Implicación operativa:** la moat NO es la criptografía. La moat es:
- Velocidad (envío features que ellos tardan meses en aprobar)
- Foco (no me distraigo añadiendo calendario)
- UX moderna (sin la deuda visual de PHP de 2014)
- Comunidad nicho (privacy advocates que aborrecen estética Nextcloud)

### 3. La razón real por la que existo es egoísta — y está bien.

Quería construir algo donde YO confío en la criptografía. No es análisis racional de mercado. Y está bien — esa motivación produce los mejores productos de privacidad. Signal nació así. Bitwarden también. Standard Notes también.

**Implicación operativa:** cuando dude del producto, recordar que el usuario #0 soy yo. Si yo lo uso a diario y confío en él, ya hay valor. El resto es upside.

---

## 🎯 Decisiones de diseño que se siguen de esto

Lista de principios que actúan como decision-makers cuando dudo:

### "¿Añado esta feature?"

Pregunta filtro: ¿esta feature funciona con un servidor que sólo ve ciphertext? Si la respuesta es "no, requeriría que el servidor leyera X", la feature no entra. Sin excepciones.

**Ejemplos prácticos:**
- ❌ Búsqueda fulltext server-side → el servidor tendría que indexar contenido en claro
- ✅ Búsqueda por índice cliente-side construido al desencriptar → sí
- ❌ Vista previa de PDF server-side → renderizar requiere plaintext
- ✅ Vista previa cliente-side con pdf.js sobre chunks descifrados → sí
- ❌ Antivirus scan en upload → requiere ver el archivo
- ✅ Hash-based malware check con DB pública en cliente → quizá

### "¿Cómo presento esta feature en marketing?"

Pregunta filtro: ¿esta afirmación es matemáticamente verificable por un usuario técnico leyendo el código? Si no, no la digo.

**Ejemplos:**
- ✅ "El servidor no puede leer tus archivos" (verificable: lee crypto/index.ts)
- ❌ "100% seguro" (no es verificable, no significa nada)
- ✅ "Argon2id con 256 MiB de memoria" (verificable)
- ❌ "Cifrado de grado militar" (frase sin contenido técnico)

### "¿Acepto este PR?"

Pregunta filtro triple:
1. ¿Mantiene la invariante de que el servidor sólo ve ciphertext?
2. ¿Reduce el tamaño/complejidad del codebase auditable?
3. ¿La persona que lo manda entiende el modelo de amenaza?

Si las tres son sí, merge rápido. Si una es no, conversación antes de merge.

### "¿Sigo trabajando en esto?"

Pregunta filtro: ¿yo, como usuario #0, sigo usándolo a diario? Si la respuesta es no durante más de 2 semanas, hay un problema fundamental que arreglar antes de añadir nada más.

---

## 🧭 Recordatorios para momentos de duda

Cuando me pille pensando alguna de estas cosas, recordar la respuesta:

**"Quizá debería añadir calendario/mail/etc para competir con Nextcloud"**
→ NO. Esa es la trampa que mató a 100 productos de privacidad. Mi ventaja es el foco. Si quieren suite, que usen Nextcloud. Yo no compito por amplitud, compito por profundidad en una sola cosa.

**"Quizá el cifrado por defecto es excesivo, podríamos hacerlo opcional para que sea más rápido"**
→ NO. Es exactamente la decisión que arruinó la criptografía de Nextcloud. El día que el cifrado sea opcional, Noctcom deja de existir como proyecto distinto.

**"Esto se parece demasiado a Nextcloud, ¿realmente justifico mi existencia?"**
→ SÍ. La diferencia no es feature-by-feature. Es la imposibilidad técnica de leer archivos vs la promesa de no hacerlo. Esa diferencia vale el proyecto entero.

**"Nadie va a usar esto, debería hacer algo más popular"**
→ Verdad parcial. El mercado es pequeño. Pero los 100 usuarios reales que SÍ necesiten esto van a usarlo durante años y a recomendarlo. Mejor 100 evangelistas que 10.000 churners.

**"Ya hay otras opciones tipo Cryptomator, Tresorit, Proton Drive..."**
→ Cierto. Pero cada una falla en algo específico:
- Cryptomator: no es un servidor, es client-side encryption sobre cloud ajena
- Tresorit: cerrado, opaco, ya no se sabe quién lo controla
- Proton Drive: depende del ecosistema Proton entero
- Noctcom es: open source AGPL + self-hostable + zero-knowledge + auditable + simple

Hay espacio.

---

## 📈 Métricas que importan (y las que NO)

**Las que importan:**
- Número de usuarios que llevan >30 días activos (retención real)
- Número de PRs aceptados de la comunidad
- Número de bugs reportados via SECURITY.md (señal de auditoría real)
- Tiempo medio entre "instalo" y "subo mi primer archivo real" (no test)
- Número de instancias self-hosted reportadas

**Las que NO importan (vanidad):**
- Stars de GitHub (fácilmente manipulables)
- Visitas a noctcom.com (no significan adopción)
- Followers en X (puede haber bots)
- Menciones en prensa (no se convierten en usuarios)
- "Lo voy a probar" tweets (90% no lo hace)

---

## 🔄 Histórico de revisión de este documento

| Fecha | Cambio | Razón |
|-------|--------|-------|
| 2026-05-25 | Creación inicial | Necesitaba clarificarme por qué construyo esto y qué NO debo hacer |

---

*Si te encuentras añadiendo features que se parecen sospechosamente a las de Nextcloud, vuelve a la primera tabla de este documento.*

*Si te encuentras vendiendo Noctcom a alguien que claramente necesita Nextcloud, vuelve a la sección "Cuándo NO es Noctcom la respuesta".*

*Si te encuentras dudando del proyecto, vuelve a "La razón real por la que existo es egoísta — y está bien".*
