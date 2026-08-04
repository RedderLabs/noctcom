# AlternativeTo — ficha de Noctcom (borrador listo para pegar)

Estado: pendiente de que la cuenta cumpla la antigüedad requerida (~7 días).
El texto está en inglés porque AlternativeTo es un sitio en inglés; abajo va la
versión ES por si se reutiliza en otra parte.

---

## Campos del formulario

**Name:** Noctcom

**Website:** https://noctcom.com

**Source code:** https://github.com/RedderLabs/noctcom

**License:** Open Source — AGPL-3.0
(la versión alojada es Freemium: 1 GB gratis permanente; el self-host no tiene
cuotas ni planes)

**Platforms:**
- Web
- Self-Hosted
- Linux (servidor / instalador de un comando, Proxmox VE LXC)
- Android / iOS — solo como PWA instalable (subir y consultar archivos)

> No marcar Windows/Mac como app nativa hasta que el binario de escritorio
> (Tauri) esté republicado y firmado.

**Categories / tags sugeridos:**
`cloud-storage` · `file-sync` · `file-sharing` · `encrypted` ·
`end-to-end-encryption` · `zero-knowledge` · `self-hosted` · `privacy` ·
`open-source` · `agpl` · `docker` · `proxmox` · `webdav-less`

---

## Short description (una línea)

> Private storage with zero-knowledge encryption: the server cannot read file
> contents, file names, folders or metadata — not even if it wanted to.

## Descripción larga

```
Noctcom is private storage built on zero-knowledge encryption. Your password and
private keys never leave your device, and the server has no technical ability to
read what you store.

What is encrypted client-side:

- File contents — XChaCha20-Poly1305 chunks, key never sent to the server
- File names and folder structure — encrypted with your vault key
- Metadata (mime type, tags) — encrypted with your vault key
- Your email address — only BLAKE2b(email) is stored, so a database dump does
  not reveal who you are
- Sharing between contacts — sealed with X25519 crypto_box_seal, with mutual
  consent and TOFU pinning of the public key

Features: encrypted vault with in-browser preview (images with zoom, video,
audio, PDF, code, text), drag & drop upload, trash with restore, favourites and
versioning; 2FA via passkeys (WebAuthn) or one-time email code; 12-word BIP39
recovery phrase that restores both the account and the files; multi-device
registration and revocation; real-time sync across devices; encrypted activity
log that is only decrypted in the client. Interface, emails and manual are fully
bilingual (English / Spanish).

Self-hosting is a first-class mode, not a stripped-down build — same features, no
quotas, no plans, no billing UI:

  curl -fsSL https://noctcom.com/install.sh | bash

The installer sets up Docker if missing, asks for your domain and issues TLS
automatically; without a domain it runs in LAN mode over HTTPS with an internal
certificate. On Proxmox VE, `bash <(curl -fsSL https://noctcom.com/lxc.sh)`
creates a Debian LXC and provisions everything inside it.

The cryptographic specification and threat model are public in the repository,
so the claim can be verified rather than trusted.

Licensed AGPL-3.0. Note: the project is pre-1.0 and has not undergone an
independent external security audit.
```

## Versión ES (para reutilizar)

```
Noctcom es almacenamiento privado con cifrado de conocimiento cero. La
contraseña y las claves privadas nunca salen del dispositivo, y el servidor no
tiene capacidad técnica de leer lo que guardas.

Se cifra en el cliente: el contenido de los archivos (XChaCha20-Poly1305), los
nombres de archivo y carpetas, los metadatos (mime, tags), el email (solo se
almacena BLAKE2b(email)) y lo compartido entre contactos (X25519 crypto_box_seal
con consentimiento mutuo y fijación TOFU de la clave pública).

Incluye vault cifrado con previsualización en el navegador, papelera con
restauración, destacados y versionado; 2FA con passkeys o código por email;
frase de recuperación BIP39 de 12 palabras que restaura cuenta y archivos;
multi-dispositivo con revocación; sincronización en tiempo real; y log de
actividad cifrado que solo se descifra en el cliente. Todo bilingüe ES/EN.

El self-host es una modalidad de primera clase, sin cuotas ni planes:
curl -fsSL https://noctcom.com/install.sh | bash
En Proxmox VE: bash <(curl -fsSL https://noctcom.com/lxc.sh)

Especificación criptográfica y modelo de amenazas públicos en el repositorio.
AGPL-3.0. Proyecto pre-1.0, sin auditoría externa independiente.
```

---

## Capturas a subir

De `frontend/public/screenshots/` (elegir 4–6, en este orden):
1. Vault con archivos
2. Previsualización de un archivo
3. Compartir con un contacto
4. Ajustes / dispositivos
5. Página de seguridad (tabla de garantías)

Vídeo opcional si el formulario acepta enlace:
`marketing/noctcom-demo-seguridad-zk.mp4` (84 s, demo de seguridad ZK).

---

## Punto a decidir antes de enviar: el campo "alternative to"

AlternativeTo se organiza precisamente alrededor de «X es alternativa a Y», y una
ficha sin ninguna relación es prácticamente invisible: nadie llega a ella salvo
por búsqueda directa del nombre.

Esto choca con el compromiso de marca de no compararse con productos concretos
(`PRODUCT.md` → Brand Commitments).

Dos lecturas posibles:

- **Estricta:** no rellenar el campo. La ficha existe, se encuentra por nombre y
  por tags (`zero-knowledge`, `self-hosted`, `encrypted`), pero apenas recibe
  tráfico de descubrimiento.
- **Pragmática:** el campo es taxonomía del sitio, no copy propio — ninguna de
  las frases de la descripción menciona a nadie. La regla de marca se mantiene
  intacta en el texto, que es donde habla Noctcom.

Recomendación: la pragmática, dejando la descripción tal cual está arriba (cero
menciones a competencia). Es tu decisión antes de enviar.

---

## Checklist de envío

- [ ] Cuenta con la antigüedad requerida cumplida
- [ ] Decidido el campo "alternative to"
- [ ] Logo subido (`marketing/noctcom-logo-512.png`)
- [ ] Capturas subidas
- [ ] Licencia marcada como Open Source / AGPL-3.0
- [ ] Enlace al repositorio añadido
- [ ] Revisado: sin afirmaciones de auditoría externa, sin cifras de uso,
      sin testimonios, sin presentarlo como estable/maduro
