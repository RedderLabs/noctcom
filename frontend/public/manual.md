# Manual de Noctcom

> Tu espacio privado. Lo que guardas aquí es tuyo y solo tuyo: se cifra en tu propio dispositivo antes de salir. Ni nosotros podemos verlo.

¡Bienvenido/a! Esta guía está pensada para acompañarte, no para abrumarte. Ve directo a lo que necesites desde el índice de aquí abajo.

---

## Índice

- [Lo esencial en 30 segundos](#lo-esencial-en-30-segundos)
- [Crear tu cuenta y entrar](#crear-tu-cuenta-y-entrar)
- [Tus archivos, a tu manera](#tus-archivos-a-tu-manera)
- [Tu seguridad, sin complicaciones](#tu-seguridad-sin-complicaciones)
- [Tu espacio](#tu-espacio)
- [Usa los discos de tu propio equipo](#usa-los-discos-de-tu-propio-equipo)
- [Móntalo en tu servidor (avanzado)](#montalo-en-tu-servidor-avanzado)
- [Que se vea cómodo para ti](#que-se-vea-comodo-para-ti)
- [Atajos rápidos](#atajos-rapidos)
- [¿Te atascas? Estamos aquí](#te-atascas-estamos-aqui)

---

## Lo esencial en 30 segundos

- **Tú tienes la llave.** Tus archivos se cifran en tu navegador con tu contraseña maestra. Viajan ya cerrados con candado; el servidor solo guarda cosas que no puede abrir.
- **Por eso, cuídala bien.** Si pierdes a la vez tu contraseña **y** tu frase de recuperación, nadie podrá recuperar tus archivos. No es que no queramos: es que técnicamente no podemos. Esa es justo la idea.
- **Guarda tu frase de recuperación.** Son 12 palabras. Apúntalas en papel o en tu gestor de contraseñas. Es tu salvavidas si algún día olvidas la contraseña.

---

## Crear tu cuenta y entrar

### Crear tu cuenta

1. Pulsa **Crear cuenta** en la página de inicio.
2. Elige un nombre de usuario y pon tu correo.
3. Crea una **contraseña maestra** fuerte. Cuanto más larga, mejor: al menos 12 caracteres, mezclando números y símbolos. Es la llave de todo, así que merece la pena pensarla bien.
4. Te daremos una **frase de recuperación** de 12 palabras. Guárdala en un sitio seguro (papel o gestor de contraseñas). Piénsalo como la copia de la llave de tu casa.
5. Te pediremos 3 de esas palabras al azar, solo para asegurarnos de que de verdad la has guardado.
6. ¡Listo! Tu espacio se crea solo.

> Un recordatorio importante, con cariño: si pierdes la contraseña y la frase de recuperación, tus datos se pierden para siempre. No hay botón mágico ni soporte que pueda rescatarlos. Guárdalas bien y dormirás tranquilo/a.

### Entrar

1. Escribe tu correo y tu contraseña maestra.
2. Tu contraseña se comprueba **en tu propio dispositivo** y nunca se manda a nuestros servidores.
3. Si has activado la verificación en dos pasos, te pediremos también un código rápido.
4. ¿Prefieres tu huella o tu cara? También puedes entrar con una Passkey.

---

## Tus archivos, a tu manera

### Tus archivos

Aquí vive todo. Es tu carpeta principal.

- **Crear una carpeta:** pulsa "Nueva carpeta" (o "Nuevo" en el menú lateral). Puedes darle un icono y un color para reconocerla de un vistazo.
- **Subir cosas:** pulsa "Subir archivos" o, más cómodo aún, arrastra los archivos desde tu escritorio y suéltalos en la ventana.
- **Ordenar:** arrastra un archivo o una carpeta encima de otra para moverlo. Como en tu ordenador de siempre.
- **Verlo a tu gusto:** cambia entre cuadrícula y lista con los botones de arriba.

### Abrir y previsualizar

Haz clic en cualquier archivo para verlo sin salir de Noctcom. Lo abrimos descifrándolo **en tu navegador**, en el momento, sin mandarlo a ningún sitio.

| Tipo | Qué puedes abrir | Cómo se ve |
|------|---------------------|---------------|
| **Imágenes** | PNG, JPG, GIF, SVG, WebP, BMP, ICO | Visor con zoom (rueda del ratón o botones +/-) |
| **Vídeo** | MP4, WebM, OGG, MOV | Reproductor normal, con sus controles |
| **Audio** | MP3, WAV, OGG, FLAC, AAC, WebM | Reproductor normal, con sus controles |
| **PDF** | PDF | Se abre dentro de la página |
| **Texto y código** | TXT, MD, JSON, JS, TS, CSS, HTML, PY, y muchos más | Con números de línea, fácil de leer |
| **Office** | DOCX, XLSX, PPTX y similares | Se descargan (el navegador no los muestra) |

Un par de detalles prácticos:

- Los archivos muy grandes (más de 50 MB) te avisan antes de abrirse, porque descifrarlos gasta memoria de tu equipo.
- Los textos enormes (más de 5 MB) se muestran recortados para que no se atasque el navegador.

### Encontrar algo rápido

Pulsa `Ctrl+K` (o `⌘K` en Mac) y busca por nombre. La búsqueda ocurre en tu dispositivo: nunca vemos qué buscas.

### Recientes, Destacados y demás

- **Recientes:** lo último que abriste o tocaste, por si quieres volver.
- **Destacados:** marca con la estrella lo que uses mucho y lo tendrás siempre a mano.
- **Compartidos:** lo que compartes con otras personas o lo que comparten contigo. Quien recibe el enlace es quien puede abrirlo.
- **Actividad:** un diario de lo que ha pasado en tu cuenta (subidas, descargas, inicios de sesión…). Útil para tener todo bajo control.
- **Papelera:** lo que borras se queda aquí 30 días por si te arrepientes. Puedes restaurarlo o vaciarlo del todo. Aunque esté en la papelera, sigue cifrado.

---

## Tu seguridad, sin complicaciones

Noctcom está construido para protegerte por defecto. Estas opciones te dan un plus de tranquilidad.

### El candado de tus archivos

Todo se cierra con candado en tu navegador **antes** de subirse. El servidor solo ve cajas cerradas: ni nosotros, ni nadie que mirara el servidor, puede leer lo que hay dentro. Para quien le interese el detalle técnico: usamos cifrado XChaCha20-Poly1305 y derivamos tu llave con Argon2id; los nombres de archivos y carpetas también van cifrados.

### Verificación en dos pasos

Un segundo candado para tu cuenta. Aunque alguien supiera tu contraseña, no entraría sin este paso. Lo activas en **Configuración > Seguridad**:

1. Activa la verificación en dos pasos.
2. Escanea el código QR con tu app del móvil (Google Authenticator, Authy, la que uses).
3. Escribe el código de 6 dígitos para confirmar y ¡listo!

### Entrar con tu huella o tu cara (Passkeys)

Si quieres entrar sin teclear, configura una Passkey:

1. Ve a **Configuración > Seguridad > Passkeys**.
2. Pulsa "Configurar".
3. Sigue lo que te diga tu navegador o tu móvil. A partir de ahí, entras con huella o Face ID.

### Cambiar tu contraseña maestra

En **Configuración > Seguridad > Cambiar contraseña maestra**. No te preocupes: tus archivos se vuelven a cerrar con la nueva llave automáticamente, y tus sesiones abiertas siguen funcionando.

### Recuperar tu cuenta con la frase de 12 palabras

¿Olvidaste la contraseña? Para eso guardaste tus 12 palabras:

1. En la pantalla de entrada, pulsa **¿Olvidaste tu contraseña?**
2. Pon tu correo.
3. Escribe las 12 palabras en orden (puedes pegarlas todas de golpe).
4. Elige una contraseña maestra nueva.
5. Por seguridad, cerramos las sesiones antiguas y volvemos a cifrar tus llaves.

### Tus dispositivos

En **Configuración > Dispositivos** ves desde dónde tienes la sesión abierta. Si ves algo raro o usaste un ordenador prestado, puedes cerrar esa sesión a distancia.

---

## Tu espacio

Cada cuenta empieza con 1 GB gratis, cifrado. En el menú lateral ves cuánto llevas usado, y en **Configuración > Almacenamiento** tienes el desglose por tipo de archivo. Si necesitas más sitio, podrás ampliarlo.

---

## Usa los discos de tu propio equipo

¿Tienes un disco duro o un SSD en casa con sitio de sobra? Puedes usarlo como almacenamiento para Noctcom.

Aquí va una verdad técnica que conviene saber: una página web **no puede tocar los discos de tu ordenador** por sí sola (tu navegador lo impide, y menos mal, por seguridad). Por eso existe un pequeño programa, el **Noctcom Connector**, que hace de puente de confianza entre tu equipo y la web.

Lo importante para ti:

- **No abre puertas en tu equipo.** Es él quien llama hacia fuera, no al revés. Nada queda expuesto.
- **Solo maneja cajas cerradas.** Tus llaves nunca salen de tu máquina; el programa solo mueve datos ya cifrados.
- **Es solo tuyo.** Está atado a tu cuenta. Nadie más puede ver ni tocar tus discos.

> Por ahora está disponible para **Windows**. Las versiones de Mac y Linux llegan pronto.

### 1. Descárgalo

Ve a **Configuración > Noctcom Connector** y pulsa **Descargar para Windows**. Es un único archivo (`noctcom-connector.exe`) y no hace falta instalar nada.

> La primera vez, Windows puede mostrar un aviso de "editor desconocido". Es normal (el programa aún no tiene una firma oficial). Pulsa **Más información** y luego **Ejecutar de todas formas**. Es seguro: se crea a partir del código abierto del proyecto.

### 2. Conéctalo con tu cuenta

1. En **Configuración > Noctcom Connector**, pulsa **Vincular agente** y ponle un nombre (por ejemplo, "PC del salón"). Te daremos un **código** que dura 10 minutos.
2. Abre una terminal **en la carpeta donde se descargó** el archivo (normalmente Descargas). Truco rápido: dentro de esa carpeta, escribe `cmd` en la barra de direcciones del Explorador y pulsa Enter.
3. Escribe esto, pegando tu código:

```text
.\noctcom-connector.exe pair --code TU_CODIGO
```

### 3. Déjalo en marcha

```text
.\noctcom-connector.exe run
```

Mantén esa ventana abierta mientras quieras gestionar tus discos desde la web. (En una próxima versión funcionará solo, en segundo plano, sin terminal.)

### 4. Mira tus discos y elige uno

Vuelve a **Configuración > Noctcom Connector** y recarga la página: tu equipo aparecerá **en línea** con sus discos (C:, D:, el USB que conectaste…), su espacio libre y demás.

En cada disco verás el botón **Usar este disco**. Al pulsarlo, Noctcom crea una carpeta (`noctcom-blobs`) dentro de ese disco para guardar ahí tus archivos cifrados. **No formatea ni borra nada**: lo que ya tenías sigue intacto. Si cambias de idea, **Dejar de usar** lo da de baja sin tocar tus datos.

### Comandos por si los necesitas

| Escribe esto | Y hace… |
| --- | --- |
| `.\noctcom-connector.exe status` | Te dice si está vinculado a tu cuenta |
| `.\noctcom-connector.exe pair --code CODIGO` | Lo vincula a tu cuenta (solo la primera vez) |
| `.\noctcom-connector.exe run` | Lo pone en marcha (deja la ventana abierta) |
| `.\noctcom-connector.exe --help` | Te lista todo lo que puede hacer |

> Lo que viene pronto: guardar de verdad tus archivos en ese disco a través del programa, y poder formatear discos vacíos desde la web.

---

## Móntalo en tu servidor (avanzado)

Noctcom es 100% código abierto (licencia AGPL-3.0). Si te manejas con la tecnología, puedes tenerlo en tu propio servidor:

```bash
git clone https://github.com/RedderLabs/noctcom.git
cd noctcom
cp .env.example .env
# Edita .env con tus contraseñas y tu dominio
docker compose up -d
```

### Qué necesitas

- Docker y Docker Compose.
- Al menos 2 GB de RAM (una parte la usa el cifrado).
- Un dominio apuntando a tu servidor (para que el candado de seguridad HTTPS se configure solo).

### Añadir más discos en tu servidor

Noctcom encuentra solo los discos que montes en el servidor. Desde **Configuración > Almacenamiento** los ves, los activas con un clic y, si hace falta, los preparas.

1. Conecta un disco o monta una partición en tu servidor.
2. Noctcom lo detecta automáticamente.
3. Aparece en la sección de almacenamiento.
4. Lo activas con un clic y ya cuenta como espacio extra.

¿Qué formato de disco usar? Una guía rápida:

| Formato | Bueno para | A tener en cuenta |
|---------|-----------------|-------------|
| **ext4** | Linux (lo más común) | No se lee en Windows sin extras |
| **XFS** | Linux con archivos muy grandes | Parecido a ext4, va fino con volúmenes enormes |
| **NTFS** | Windows | Funciona en Linux, pero más lento |
| **FAT32** | Mejor evítalo | No admite archivos de más de 4 GB |
| **exFAT** | USB entre distintos sistemas | Más propenso a corromperse |

**En resumen:** si es Linux, ext4 y a correr. Si tu disco viene en otro formato, Noctcom te ofrecerá prepararlo (avisándote antes de borrar nada).

---

## Que se vea cómodo para ti

### Texto más grande o más pequeño

Usa los botones de tamaño de texto (A, A+, A++). Están en el menú lateral cuando estás dentro, y en la barra de arriba en las pantallas de entrada. Se guarda tu preferencia automáticamente.

### Menú lateral plegable

Pulsa el botón de plegar en la parte de arriba del menú para dejarlo en modo "solo iconos". Va genial en pantallas pequeñas o si usas texto grande.

---

## Atajos rápidos

| Atajo | Para qué |
|-------|--------|
| `Ctrl+K` / `⌘K` | Buscar en tu cuenta |

---

## ¿Te atascas? Estamos aquí

- **El código de Noctcom:** [github.com/RedderLabs/noctcom](https://github.com/RedderLabs/noctcom)
- **¿Algo no va bien?** Cuéntanoslo en [GitHub Issues](https://github.com/RedderLabs/noctcom/issues)
- **¿Has visto un fallo de seguridad?** Mira cómo avisarnos en [SECURITY.md](https://github.com/RedderLabs/noctcom/blob/main/SECURITY.md)

---

*Última actualización: v0.1.0 · Junio 2026*
