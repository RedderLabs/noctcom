# Noctcom Connector

Agente local de [Noctcom](https://noctcom.com). Te deja gestionar los discos de **tu**
máquina desde la web cloud: abre una conexión saliente cifrada (sin puertos abiertos) y
tus claves privadas **nunca** salen de tu equipo. Solo se registra la clave pública.

## Aviso del antivirus / SmartScreen

El binario **aún no está firmado** (el certificado Authenticode EV llegará pronto). Por eso:

- **Windows SmartScreen** puede mostrar *«Windows protegió tu PC / editor desconocido»* al
  abrirlo. Pulsa **Más información → Ejecutar de todos modos**.
- Algún motor antivirus puede marcarlo como sospechoso por **heurística genérica** (es un
  ejecutable pequeño que usa red y disco — el perfil que disparan los detectores ML). No es
  malware: el código es abierto (AGPL-3.0) y puedes compilarlo tú mismo.

### Verifica la descarga

Cada release publica el **SHA256** de cada binario. Compáralo con el que descargues:

```powershell
# Windows (PowerShell)
Get-FileHash .\noctcom-connector.exe -Algorithm SHA256
```

```bash
# Linux / macOS
sha256sum noctcom-connector        # Linux
shasum -a 256 noctcom-connector    # macOS
```

Debe coincidir con el `.sha256` adjunto a la release. Además puedes ver el análisis público
en **VirusTotal** (enlace en la página de descarga dentro de la app).

## Uso

```sh
# 1) Empareja con tu cuenta (el código lo muestra la web, caduca en 10 min)
noctcom-connector pair --code XXXXXXXX

# 2) Déjalo conectado
noctcom-connector run

# Otros
noctcom-connector status   # ¿está emparejado?
noctcom-connector update   # actualiza si hay versión nueva
```

No requiere permisos de administrador para arrancar (`asInvoker`). Las operaciones que sí los
necesiten (p. ej. formatear un disco) deben lanzarse desde una consola elevada.

## Compilar desde el código

```sh
cd agent
cargo build --release
# binario en target/release/noctcom-connector(.exe)
```

Licencia: **AGPL-3.0**.
