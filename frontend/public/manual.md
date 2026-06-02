# Manual de usuario — Noctcom v0.1.0

> Tu bóveda privada. Cifrada en tu dispositivo.

---

## Primeros pasos

### Crear tu cuenta

1. Ve a **Crear cuenta** desde la página principal
2. Elige un nombre de usuario y correo electrónico
3. Crea una **contraseña maestra** fuerte (mínimo 12 caracteres, con números y símbolos)
4. Se generará una **frase de recuperación** de 12 palabras — guárdala en papel o en un gestor de contraseñas
5. Confirma 3 palabras al azar para verificar que la guardaste
6. Tu bóveda se crea automáticamente

**Importante:** si pierdes tu contraseña y tu frase de recuperación, tus datos son irrecuperables. Noctcom no puede restaurarlos.

### Iniciar sesión

1. Introduce tu correo y contraseña maestra
2. La contraseña se procesa localmente con Argon2id — nunca se envía al servidor
3. Si tienes 2FA activado, introduce el código de 6 dígitos de tu app autenticadora
4. También puedes usar una Passkey (huella digital o Face ID)

---

## Tu bóveda

### Mis archivos

La sección principal donde gestionas todos tus archivos y carpetas.

- **Crear carpeta:** botón "Nueva carpeta" o el botón "Nuevo" en el sidebar. Elige icono y color para identificarla rápidamente
- **Subir archivos:** botón "Subir archivos" o arrastra archivos desde tu escritorio directamente a la ventana
- **Mover archivos:** arrastra un archivo o carpeta sobre otra carpeta para moverlo
- **Vista:** alterna entre vista de cuadrícula y lista con los botones de la barra superior

### Previsualizar archivos

Haz clic en cualquier archivo para abrirlo en el visor integrado. Noctcom descifra el contenido en tu navegador y lo muestra directamente, sin enviarlo a ningún servidor.

| Tipo | Formatos soportados | Funcionalidad |
|------|---------------------|---------------|
| **Imágenes** | PNG, JPG, GIF, SVG, WebP, BMP, ICO | Visor con zoom (rueda del ratón o botones +/-) |
| **Video** | MP4, WebM, OGG, MOV | Reproductor con controles nativos |
| **Audio** | MP3, WAV, OGG, FLAC, AAC, WebM | Reproductor con controles nativos |
| **PDF** | PDF | Visualizador integrado en el navegador |
| **Texto y codigo** | TXT, MD, JSON, JS, TS, TSX, JSX, CSS, HTML, XML, YAML, TOML, PY, GO, RS, Java, C, C++, SQL, SH, CSV, LOG, SVG, INI, Dockerfile, Makefile | Vista con numeros de linea |
| **Office** | DOCX, XLSX, PPTX, DOC, XLS, PPT | Solo descarga (no previsualizable en el navegador) |

- Los archivos `.txt` y `.md` se muestran en un editor de texto
- Los archivos de codigo se muestran con numeros de linea en fuente monoespaciada
- Para archivos mayores de 50 MB se muestra una advertencia antes de descifrar (consume RAM)
- Archivos de texto mayores de 5 MB se muestran truncados

### Buscar

Usa la barra de búsqueda (atajo `Ctrl+K` o `⌘K`) para encontrar archivos por nombre. La búsqueda se realiza sobre un índice cifrado local — el servidor nunca ve tus consultas.

### Recientes

Archivos que abriste o modificaste recientemente, ordenados por fecha de acceso.

### Destacados

Marca archivos o carpetas con la estrella para acceder a ellos rápidamente desde esta sección.

### Compartidos

Archivos que compartiste con otros usuarios o que te compartieron a ti. Los archivos compartidos se cifran con una clave derivada única — el receptor necesita el enlace completo para descifrar.

### Actividad

Registro cronológico de todas las acciones en tu bóveda: subidas, descargas, creación de carpetas, sesiones, cambios de seguridad, etc.

### Papelera

Archivos eliminados se mantienen 30 días antes de borrarse permanentemente. Puedes restaurarlos o eliminarlos definitivamente. Los archivos en la papelera siguen cifrados.

---

## Seguridad

### Cifrado

Todos tus archivos se cifran en tu navegador antes de subirse al servidor:

- **Algoritmo:** XChaCha20-Poly1305 (nonces de 24 bytes)
- **Derivación de claves:** Argon2id con 256 MiB de memoria
- **Chunks:** cada archivo se divide en bloques de 4 MiB, cifrados independientemente
- **Metadatos:** nombres de archivos, carpetas y tags también se cifran

El servidor solo ve datos cifrados. Ni siquiera el operador de Noctcom puede leer tus archivos.

### Autenticación de dos factores (2FA)

Activa 2FA desde **Configuración > Seguridad**:

1. Haz clic en el toggle de "Autenticación de dos factores (TOTP)"
2. Escanea el código QR con tu app autenticadora (Google Authenticator, Authy, etc.)
3. Introduce el código de 6 dígitos para confirmar
4. A partir de ahora necesitarás el código en cada inicio de sesión

### Passkeys

Configura una Passkey para autenticarte con tu huella digital o Face ID:

1. Ve a **Configuración > Seguridad > Passkeys**
2. Haz clic en "Configurar"
3. Sigue las instrucciones de tu navegador para registrar la credencial

### Contraseña maestra

Para cambiar tu contraseña:

1. Ve a **Configuración > Seguridad > Cambiar contraseña maestra**
2. Todas tus claves se re-cifrarán con la nueva contraseña
3. Las sesiones activas seguirán funcionando

### Frase de recuperación

Si olvidas tu contraseña, puedes restaurar tu cuenta con la frase de 12 palabras:

1. Ve a **¿Olvidaste tu contraseña?** en la pantalla de login
2. Introduce tu correo electrónico
3. Escribe las 12 palabras en orden (puedes pegar la frase completa de golpe)
4. Crea una nueva contraseña maestra
5. Todas tus sesiones anteriores se revocan y tus claves se re-cifran

### Dispositivos

En **Configuración > Dispositivos** puedes ver tu sesión actual y revocar sesiones de otros dispositivos.

---

## Almacenamiento

### Plan gratuito

Cada cuenta incluye 2 GB de almacenamiento cifrado. Puedes ampliar tu cuota desde los planes de pago.

### Uso

En el sidebar puedes ver cuánto espacio has usado. En **Configuración > Almacenamiento** hay un desglose por tipo de archivo.

---

## Conectar discos de tu equipo (Noctcom Connector)

En la versión web (en la nube), Noctcom **no puede ver ni gestionar los discos de tu propio ordenador**: el navegador lo impide por seguridad. Para usar un disco de tu equipo (por ejemplo un HDD o SSD por USB) como almacenamiento, instalas un pequeño programa llamado **Noctcom Connector** que hace de puente entre tu máquina y la web.

- Abre una conexión **saliente** y cifrada hacia Noctcom: **no abre ningún puerto** en tu equipo.
- Solo maneja **datos ya cifrados**: tus claves nunca salen de tu máquina (zero-knowledge).
- Está atado a tu cuenta: ningún otro usuario puede ver ni tocar tus discos.

> Disponible hoy para **Windows**. Las versiones de macOS y Linux llegan próximamente.

### 1. Descargar el agente

Ve a **Configuración > Noctcom Connector** y pulsa **Descargar para Windows**. Se descarga un único archivo, `noctcom-connector.exe`, que no necesita instalación.

> La primera vez, Windows SmartScreen puede avisar de "editor desconocido" (el binario aún no está firmado). Pulsa **Más información** y luego **Ejecutar de todas formas**. Es seguro: se compila desde el código abierto del proyecto.

### 2. Vincularlo con tu cuenta

1. En **Configuración > Noctcom Connector**, pulsa **Vincular agente** y ponle un nombre. Obtendrás un **código** válido durante 10 minutos.
2. Abre una terminal **en la carpeta donde se descargó** el archivo (normalmente Descargas). Truco: en el Explorador, dentro de esa carpeta, escribe `cmd` en la barra de direcciones y pulsa Enter.
3. Ejecuta este comando pegando tu código:

```text
.\noctcom-connector.exe pair --code TU_CODIGO
```

### 3. Conectarlo

Déjalo conectado con:

```text
.\noctcom-connector.exe run
```

Mantén esa ventana abierta mientras quieras gestionar tus discos desde la web. En una próxima versión el agente se instalará como servicio y arrancará solo en segundo plano, sin necesidad de la terminal.

### 4. Ver tus discos

Vuelve a **Configuración > Noctcom Connector** y refresca la página. El agente aparecerá como **en línea**. Pulsa **Ver discos** y verás las unidades de tu equipo (C:, D:, USB…) con su espacio libre y su sistema de archivos.

### Comandos útiles

| Comando | Para qué sirve |
| --- | --- |
| `.\noctcom-connector.exe status` | Ver si el agente está emparejado |
| `.\noctcom-connector.exe pair --code CODIGO` | Vincularlo a tu cuenta (solo una vez) |
| `.\noctcom-connector.exe run` | Conectarlo (deja la ventana abierta) |
| `.\noctcom-connector.exe --help` | Ver todos los comandos |

> Próximamente: montar y formatear discos desde la web, y guardar tus archivos directamente en el disco de tu equipo a través del agente.

---

## Self-hosting

Noctcom es 100% open source (AGPL-3.0). Puedes desplegarlo en tu propio servidor:

```bash
git clone https://github.com/RedderLabs/noctcom.git
cd noctcom
cp .env.example .env
# Edita .env con tus contraseñas y dominio
docker compose up -d
```

### Requisitos mínimos

- Docker y Docker Compose
- 2 GB de RAM (256 MiB son para Argon2id)
- Dominio con DNS apuntando a tu servidor (para TLS automático via Caddy)

### Almacenamiento externo

Noctcom detecta automáticamente los discos montados en tu servidor. Desde **Configuración > Almacenamiento** puedes ver los discos disponibles, activarlos como almacenamiento adicional o formatearlos si no tienen un formato compatible.

#### Detección automática

1. Conecta un disco externo o monta una partición en tu servidor
2. Noctcom lo detecta automáticamente al escanear `/mnt`, `/media` y `/volumes`
3. Aparecerá en la sección de almacenamiento de Configuración
4. Actívalo con un clic para que se use como espacio adicional

#### Formatos de disco recomendados

| Formato | Recomendado para | Limitaciones |
|---------|-----------------|-------------|
| **ext4** | Linux (la mayoría de self-host) | No legible en Windows sin drivers |
| **XFS** | Linux con archivos muy grandes | Similar a ext4, mejor para volúmenes grandes |
| **NTFS** | Windows | Soporte lectura/escritura en Linux pero menor rendimiento |
| **FAT32** | Ninguno | Límite de 4 GB por archivo, inaceptable para una bóveda |
| **exFAT** | USB compartido entre SO | Sin journaling, riesgo de corrupción |

**Recomendación:** ext4 como formato por defecto para self-host en Linux (99% de los casos). Si el disco viene en FAT32, NTFS o exFAT, Noctcom ofrecerá formatearlo a ext4 con advertencia de pérdida de datos.

#### Montaje manual (avanzado)

Si prefieres configurar los volúmenes manualmente, edita `docker-compose.override.yml`:

```yaml
services:
  minio:
    volumes:
      - /mnt/disco-externo:/data2
```

MinIO distribuye los datos entre los volúmenes disponibles automáticamente.

---

## Accesibilidad

### Tamaño de fuente

Usa el control de escala de fuente (botones A, A+, A++) disponible en:
- El sidebar (dentro de la bóveda)
- La barra superior (en login, signup y recovery)

El ajuste se guarda automáticamente.

### Sidebar colapsable

Haz clic en el botón de colapsar (⫷) en la parte superior del sidebar para reducirlo a solo iconos. Útil en pantallas pequeñas o con fuentes grandes.

---

## Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Ctrl+K` / `⌘K` | Buscar en la bóveda |

---

## Soporte

- **Código fuente:** [github.com/RedderLabs/noctcom](https://github.com/RedderLabs/noctcom)
- **Reportar un bug:** [GitHub Issues](https://github.com/RedderLabs/noctcom/issues)
- **Vulnerabilidad de seguridad:** ver [SECURITY.md](https://github.com/RedderLabs/noctcom/blob/main/SECURITY.md)

---

*Última actualización: v0.1.0 · Mayo 2026*
