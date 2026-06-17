'use client';

import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  Lock, Shield, FolderTree, HardDrive, Wrench, ShieldCheck, Mail,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader, SectionHead } from '@/components/selfhost/PageHeader';

// Manual de usuario del self-host. El contenido es bilingüe e inline (por
// locale) en lugar de cientos de claves i18n: es un documento largo con
// comandos, más fácil de mantener así. Los comandos son idénticos en ambos
// idiomas, por eso van en bloques `code` fuera de la traducción.

type Block =
  | { p: string }
  | { steps: string[] }
  | { code: string[] }
  | { note: string }
  | { link: { href: string; label: string } };

interface Section { id: string; icon: LucideIcon; title: string; blocks: Block[]; }

const CONTENT: Record<'es' | 'en', { title: string; intro: string; sections: Section[] }> = {
  es: {
    title: 'Manual de usuario',
    intro: 'Cómo usar y administrar tu Noctcom autoalojado en Proxmox: acceso, seguridad, archivos y discos.',
    sections: [
      {
        id: 'acceso', icon: Lock, title: 'Acceso',
        blocks: [
          { p: 'Entra siempre por HTTPS: <b>https://&lt;IP-del-contenedor&gt;</b>. Noctcom cifra en tu navegador (zero-knowledge) y eso solo funciona en «contexto seguro» (HTTPS o localhost); por HTTP plano el navegador desactiva el cifrado.' },
          { p: 'La primera vez verás un aviso de certificado autofirmado (es normal en red local): pulsa <b>Avanzado → Continuar</b>. Para evitar el aviso, usa un dominio (TLS de Let’s Encrypt) o un túnel con HTTPS (Tailscale/Cloudflare).' },
          { p: 'El primer usuario que se registra es el <b>administrador</b> del servidor.' },
        ],
      },
      {
        id: 'seguridad', icon: Shield, title: 'Seguridad',
        blocks: [
          { p: 'Tu <b>frase de cifrado</b> deriva las claves en tu dispositivo (Argon2id). El servidor nunca la recibe: si la pierdes a la vez que la recuperación, <b>nadie</b> puede abrir tus archivos, ni el administrador del Proxmox.' },
          { p: 'En <b>Seguridad</b> gestionas: clave maestra y su huella, frase de recuperación (24 palabras BIP39), doble factor (TOTP y llave física FIDO2), auto-bloqueo por inactividad y sesiones activas.' },
          { note: 'Guarda la frase de recuperación FUERA de línea (papel/gestor). Es lo único que recupera la bóveda si olvidas la contraseña.' },
          { link: { href: '/seguridad', label: 'Ir a Seguridad' } },
        ],
      },
      {
        id: 'archivos', icon: FolderTree, title: 'Archivos',
        blocks: [
          { p: 'Cada archivo se cifra con <b>AES-256-GCM</b> en tu navegador antes de salir; los nombres también van cifrados. Sube con el botón <b>Subir</b> o arrastrando, y organiza en carpetas.' },
          { p: 'Para compartir, genera un <b>enlace cifrado</b>: la clave viaja en el fragmento (#) de la URL y nunca llega al servidor. Compártelo por un canal seguro.' },
          { p: 'El <b>visor</b> descifra y muestra la vista previa en tu dispositivo (PDF, imagen, vídeo). El historial guarda versiones anteriores.' },
        ],
      },
      {
        id: 'almacenamiento', icon: HardDrive, title: 'Almacenamiento y discos (añadir HDD)',
        blocks: [
          { p: 'Por defecto, los archivos cifrados se guardan <b>a disco</b>, en el volumen <b>/data</b> del contenedor (LXC); el panel lo muestra como «Disco del servidor». Para tener más espacio tienes dos caminos. Mira el número de tu contenedor con <b>pct list</b>.' },
          { p: '<b>Vía simple (recomendada): ampliar el disco del LXC.</b> En la consola del host Proxmox:' },
          { code: ['# amplía 50 GB el disco del contenedor 101', 'pct resize 101 rootfs +50G'] },
          { p: 'Eso es todo: <b>/data</b> dispone del espacio nuevo automáticamente, sin reiniciar nada.' },
          { p: '<b>Vía avanzada: dedicar un disco físico entero.</b> Útil para separar los blobs en su propio HDD. Lo más sencillo es el script <b>add-disk.sh</b>, que desde el host formatea (opcional), monta, engancha el disco al LXC y lo registra en <b>EXTRA_DATA_DIR</b>:' },
          { code: [
            '# EN EL HOST Proxmox (como root, no dentro del LXC)',
            'bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/add-disk.sh)',
          ] },
          { p: 'Si prefieres hacerlo a mano (haz copia de seguridad antes):' },
          { steps: [
            'En el host, prepara el disco: lsblk → mkfs.ext4 /dev/sdX → móntalo (p. ej. en /mnt/noctcom-data).',
            'Pásalo al contenedor como punto de montaje: pct set 101 -mp0 /mnt/noctcom-data,mp=/mnt/noctcom-data',
            'En el .env del LXC añade EXTRA_DATA_DIR=/mnt/noctcom-data y ejecuta bash update.sh: el backend lo bind-monta y ajusta permisos.',
            'Regístralo en la app (Almacenamiento → Añadir volumen) con ese mismo path.',
          ] },
          { code: [
            '# pasar un disco ya montado del host al contenedor 101',
            'pct set 101 -mp0 /mnt/noctcom-data,mp=/mnt/noctcom-data',
          ] },
          { note: 'En self-host, lo normal es la vía simple (ampliar el disco del LXC). El destino por defecto es el disco /data, no MinIO. Los «volúmenes» de la pantalla Almacenamiento sirven para discos adicionales (vía EXTRA_DATA_DIR) o conectados por un agente (escritorio); para registrar una carpeta local, primero debe estar montada dentro del contenedor.' },
          { link: { href: '/almacenamiento', label: 'Ir a Almacenamiento' } },
        ],
      },
      {
        id: 'email', icon: Mail, title: 'Email (verificación y OTP)',
        blocks: [
          { p: 'El correo es <b>opcional</b>: sin configurarlo, Noctcom funciona, pero no envía verificación de cuenta ni códigos OTP. Para activarlo hay dos opciones; si defines <b>RESEND_API_KEY</b> se usa Resend, si no, los ajustes <b>SMTP_*</b>.' },
          { p: '<b>Opción A — Resend (recomendada).</b> Crea una API key en resend.com y <b>verifica un dominio</b> (añade sus registros DNS); el remitente debe pertenecer a ese dominio. Sin dominio propio solo puedes usar onboarding@resend.dev, que envía únicamente al email de tu cuenta Resend (sirve para probar).' },
          { p: 'En el .env de la instalación (dentro del contenedor, <b>/opt/noctcom</b>):' },
          { code: ['RESEND_API_KEY=re_tu_clave', 'SMTP_FROM=noreply@tudominio.com   # dominio verificado en Resend'] },
          { p: '<b>Opción B — SMTP.</b> Si prefieres tu propio servidor o proveedor SMTP, deja RESEND_API_KEY vacío y rellena:' },
          { code: ['SMTP_HOST=smtp.tuproveedor.com', 'SMTP_PORT=465', 'SMTP_USER=usuario', 'SMTP_PASS=contraseña', 'SMTP_FROM=noreply@tudominio.com'] },
          { p: 'Aplica los cambios reconstruyendo el backend:' },
          { code: ['cd /opt/noctcom', 'bash update.sh   # o: docker compose up -d --build backend'] },
          { note: 'Si un envío falla, revisa los registros: docker compose logs -f backend. Resend devuelve el motivo exacto (dominio sin verificar, clave inválida, etc.).' },
        ],
      },
      {
        id: 'mantenimiento', icon: Wrench, title: 'Mantenimiento',
        blocks: [
          { p: 'Desde la carpeta de la instalación dentro del contenedor (<b>/opt/noctcom</b>):' },
          { code: [
            '# entrar al contenedor desde el host',
            'pct enter 101',
            '',
            '# ver registros en vivo',
            'cd /opt/noctcom && docker compose logs -f',
            '',
            '# actualizar a la última versión (conserva tus datos y secretos)',
            'bash update.sh',
          ] },
          { p: 'Haz copia de seguridad de estos volúmenes Docker: <b>noctcom_postgres_data</b> (base de datos), <b>noctcom_blob_data</b> (blobs cifrados, destino por defecto) y, si lo usas, <b>noctcom_minio_data</b>. Si dedicaste un disco con EXTRA_DATA_DIR, respalda también esa ruta.' },
          { note: 'Reserva la IP del contenedor en tu router/DHCP para que la dirección no cambie.' },
        ],
      },
    ],
  },
  en: {
    title: 'User manual',
    intro: 'How to use and administer your self-hosted Noctcom on Proxmox: access, security, files and disks.',
    sections: [
      {
        id: 'acceso', icon: Lock, title: 'Access',
        blocks: [
          { p: 'Always use HTTPS: <b>https://&lt;container-IP&gt;</b>. Noctcom encrypts in your browser (zero-knowledge) and that only works in a «secure context» (HTTPS or localhost); over plain HTTP the browser disables crypto.' },
          { p: 'The first time you’ll see a self-signed certificate warning (normal on a LAN): click <b>Advanced → Continue</b>. To avoid the warning, use a domain (Let’s Encrypt TLS) or an HTTPS tunnel (Tailscale/Cloudflare).' },
          { p: 'The first user to register becomes the server <b>administrator</b>.' },
        ],
      },
      {
        id: 'seguridad', icon: Shield, title: 'Security',
        blocks: [
          { p: 'Your <b>encryption passphrase</b> derives the keys on your device (Argon2id). The server never receives it: if you lose it along with the recovery phrase, <b>nobody</b> can open your files — not even the Proxmox admin.' },
          { p: 'In <b>Security</b> you manage: master key and its fingerprint, recovery phrase (24-word BIP39), two-factor (TOTP and FIDO2 hardware key), idle auto-lock and active sessions.' },
          { note: 'Store the recovery phrase OFFLINE (paper/manager). It is the only thing that recovers the vault if you forget your password.' },
          { link: { href: '/seguridad', label: 'Go to Security' } },
        ],
      },
      {
        id: 'archivos', icon: FolderTree, title: 'Files',
        blocks: [
          { p: 'Each file is encrypted with <b>AES-256-GCM</b> in your browser before leaving; names are encrypted too. Upload with the <b>Upload</b> button or by dragging, and organize into folders.' },
          { p: 'To share, generate an <b>encrypted link</b>: the key travels in the URL fragment (#) and never reaches the server. Share it over a secure channel.' },
          { p: 'The <b>viewer</b> decrypts and previews on your device (PDF, image, video). History keeps previous versions.' },
        ],
      },
      {
        id: 'almacenamiento', icon: HardDrive, title: 'Storage & disks (adding an HDD)',
        blocks: [
          { p: 'By default, encrypted files are stored <b>on disk</b>, in the container (LXC) <b>/data</b> volume; the panel shows it as «Server disk». To get more space you have two paths. Find your container number with <b>pct list</b>.' },
          { p: '<b>Simple path (recommended): grow the LXC disk.</b> On the Proxmox host console:' },
          { code: ['# grow container 101 disk by 50 GB', 'pct resize 101 rootfs +50G'] },
          { p: 'That’s it: <b>/data</b> gets the new space automatically, no restart needed.' },
          { p: '<b>Advanced path: dedicate a whole physical disk.</b> Useful to keep blobs on their own HDD. The easiest way is the <b>add-disk.sh</b> script, which from the host formats (optional), mounts, attaches the disk to the LXC and registers it in <b>EXTRA_DATA_DIR</b>:' },
          { code: [
            '# ON THE Proxmox host (as root, not inside the LXC)',
            'bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/add-disk.sh)',
          ] },
          { p: 'If you prefer to do it by hand (back up first):' },
          { steps: [
            'On the host, prepare the disk: lsblk → mkfs.ext4 /dev/sdX → mount it (e.g. at /mnt/noctcom-data).',
            'Attach it to the container as a mount point: pct set 101 -mp0 /mnt/noctcom-data,mp=/mnt/noctcom-data',
            'In the LXC .env add EXTRA_DATA_DIR=/mnt/noctcom-data and run bash update.sh: the backend bind-mounts it and fixes permissions.',
            'Register it in the app (Storage → Add volume) with that same path.',
          ] },
          { code: [
            '# attach an already-mounted host disk to container 101',
            'pct set 101 -mp0 /mnt/noctcom-data,mp=/mnt/noctcom-data',
          ] },
          { note: 'In self-host, the simple path is the norm (grow the LXC disk). The default destination is the /data disk, not MinIO. The «volumes» on the Storage screen are for extra disks (via EXTRA_DATA_DIR) or disks attached through an agent (desktop); to register a local folder it must first be mounted inside the container.' },
          { link: { href: '/almacenamiento', label: 'Go to Storage' } },
        ],
      },
      {
        id: 'email', icon: Mail, title: 'Email (verification & OTP)',
        blocks: [
          { p: 'Email is <b>optional</b>: without it Noctcom still works, but it won’t send account verification or OTP codes. To enable it you have two options; if you set <b>RESEND_API_KEY</b> Resend is used, otherwise the <b>SMTP_*</b> settings.' },
          { p: '<b>Option A — Resend (recommended).</b> Create an API key at resend.com and <b>verify a domain</b> (add its DNS records); the sender must belong to that domain. Without your own domain you can only use onboarding@resend.dev, which only sends to your Resend account email (good for testing).' },
          { p: 'In the install .env (inside the container, <b>/opt/noctcom</b>):' },
          { code: ['RESEND_API_KEY=re_your_key', 'SMTP_FROM=noreply@yourdomain.com   # domain verified in Resend'] },
          { p: '<b>Option B — SMTP.</b> If you prefer your own SMTP server or provider, leave RESEND_API_KEY empty and fill in:' },
          { code: ['SMTP_HOST=smtp.yourprovider.com', 'SMTP_PORT=465', 'SMTP_USER=user', 'SMTP_PASS=password', 'SMTP_FROM=noreply@yourdomain.com'] },
          { p: 'Apply the changes by rebuilding the backend:' },
          { code: ['cd /opt/noctcom', 'bash update.sh   # or: docker compose up -d --build backend'] },
          { note: 'If sending fails, check the logs: docker compose logs -f backend. Resend returns the exact reason (unverified domain, invalid key, etc.).' },
        ],
      },
      {
        id: 'mantenimiento', icon: Wrench, title: 'Maintenance',
        blocks: [
          { p: 'From the install folder inside the container (<b>/opt/noctcom</b>):' },
          { code: [
            '# enter the container from the host',
            'pct enter 101',
            '',
            '# live logs',
            'cd /opt/noctcom && docker compose logs -f',
            '',
            '# update to the latest version (keeps your data and secrets)',
            'bash update.sh',
          ] },
          { p: 'Back up these Docker volumes: <b>noctcom_postgres_data</b> (database), <b>noctcom_blob_data</b> (encrypted blobs, default destination) and, if you use it, <b>noctcom_minio_data</b>. If you dedicated a disk via EXTRA_DATA_DIR, back up that path too.' },
          { note: 'Reserve the container IP in your router/DHCP so the address does not change.' },
        ],
      },
    ],
  },
};

function RichP({ html }: { html: string }) {
  // Solo permitimos <b> del contenido propio (no entra texto de usuario).
  return <p className="text-[13px] leading-relaxed text-text-secondary" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ManualPage() {
  const locale = useLocale();
  const data = CONTENT[locale === 'en' ? 'en' : 'es'];

  return (
    <>
      <PageHeader crumbs={['noctcom', 'manual']} title={data.title} />
      <p className="text-sm text-text-tertiary -mt-2 mb-2">{data.intro}</p>

      {data.sections.map((s) => (
        <div key={s.id}>
          <SectionHead title={s.title} />
          <div className="rounded-xl border border-border-faint bg-bg-surface p-5 space-y-3">
            <div className="flex items-center gap-2.5 text-violet-300">
              <s.icon className="size-4 shrink-0" />
              <span className="text-sm font-semibold text-text-primary">{s.title}</span>
            </div>
            {s.blocks.map((b, i) => {
              if ('p' in b) return <RichP key={i} html={b.p} />;
              if ('note' in b) return (
                <div key={i} className="flex items-start gap-2.5 rounded-lg bg-bg-deep border border-border-faint p-3">
                  <ShieldCheck className="size-4 text-violet-300 mt-0.5 shrink-0" />
                  <p className="text-xs text-text-tertiary leading-relaxed">{b.note}</p>
                </div>
              );
              if ('steps' in b) return (
                <ol key={i} className="space-y-1.5 list-none">
                  {b.steps.map((st, j) => (
                    <li key={j} className="flex gap-2.5 text-[13px] text-text-secondary leading-relaxed">
                      <span className="size-5 shrink-0 rounded-full bg-violet-500/12 text-violet-300 grid place-items-center text-[11px] font-semibold">{j + 1}</span>
                      <span>{st}</span>
                    </li>
                  ))}
                </ol>
              );
              if ('code' in b) return (
                <pre key={i} className="overflow-x-auto rounded-lg bg-bg-deep border border-border-faint p-3 text-[12px] leading-relaxed font-mono text-text-secondary">
                  {b.code.join('\n')}
                </pre>
              );
              if ('link' in b) return (
                <Link key={i} href={b.link.href as any} className="inline-flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200">
                  {b.link.label} →
                </Link>
              );
              return null;
            })}
          </div>
        </div>
      ))}
    </>
  );
}
