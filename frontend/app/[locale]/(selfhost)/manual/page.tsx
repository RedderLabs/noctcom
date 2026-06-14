'use client';

import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  Lock, Shield, FolderTree, HardDrive, Wrench, ShieldCheck,
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
          { p: 'Por defecto, los archivos cifrados se guardan en <b>MinIO</b>, dentro del disco del contenedor (LXC). Para tener más espacio tienes dos caminos. Mira el número de tu contenedor con <b>pct list</b>.' },
          { p: '<b>Vía simple (recomendada): ampliar el disco del LXC.</b> En la consola del host Proxmox:' },
          { code: ['# amplía 50 GB el disco del contenedor 101', 'pct resize 101 rootfs +50G'] },
          { p: 'Eso es todo: MinIO dispone del espacio nuevo automáticamente, sin reiniciar nada.' },
          { p: '<b>Vía avanzada: dedicar un disco físico entero.</b> Útil si quieres separar los blobs en su propio HDD. Resumen del flujo (haz copia de seguridad antes):' },
          { steps: [
            'En el host, identifica y formatea el disco: lsblk → mkfs.ext4 /dev/sdX → móntalo (p. ej. en /mnt/noctcom-data).',
            'Pásalo al contenedor como punto de montaje: pct set 101 -mp0 /mnt/noctcom-data,mp=/mnt/noctcom-data',
            'Mueve ahí los datos de MinIO (volumen noctcom_minio_data) con el stack parado, o registra la carpeta como volumen desde la app (Almacenamiento → Añadir volumen).',
          ] },
          { code: [
            '# pasar un disco ya montado del host al contenedor 101',
            'pct set 101 -mp0 /mnt/noctcom-data,mp=/mnt/noctcom-data',
          ] },
          { note: 'En self-host, lo normal es la vía simple (MinIO sobre el disco del LXC). Los «volúmenes» de la pantalla Almacenamiento sirven sobre todo para discos conectados por un agente (escritorio); para registrar una carpeta local, primero debe estar montada dentro del contenedor.' },
          { link: { href: '/almacenamiento', label: 'Ir a Almacenamiento' } },
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
          { p: 'Haz copia de seguridad de estos volúmenes Docker: <b>noctcom_postgres_data</b> (base de datos) y <b>noctcom_minio_data</b> (blobs cifrados).' },
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
          { p: 'By default, encrypted files are stored in <b>MinIO</b>, inside the container (LXC) disk. To get more space you have two paths. Find your container number with <b>pct list</b>.' },
          { p: '<b>Simple path (recommended): grow the LXC disk.</b> On the Proxmox host console:' },
          { code: ['# grow container 101 disk by 50 GB', 'pct resize 101 rootfs +50G'] },
          { p: 'That’s it: MinIO gets the new space automatically, no restart needed.' },
          { p: '<b>Advanced path: dedicate a whole physical disk.</b> Useful to keep blobs on their own HDD. Flow summary (back up first):' },
          { steps: [
            'On the host, identify and format the disk: lsblk → mkfs.ext4 /dev/sdX → mount it (e.g. at /mnt/noctcom-data).',
            'Attach it to the container as a mount point: pct set 101 -mp0 /mnt/noctcom-data,mp=/mnt/noctcom-data',
            'Move MinIO data there (volume noctcom_minio_data) with the stack stopped, or register the folder as a volume in the app (Storage → Add volume).',
          ] },
          { code: [
            '# attach an already-mounted host disk to container 101',
            'pct set 101 -mp0 /mnt/noctcom-data,mp=/mnt/noctcom-data',
          ] },
          { note: 'In self-host, the simple path is the norm (MinIO on the LXC disk). The «volumes» on the Storage screen are mainly for disks attached via an agent (desktop); to register a local folder it must first be mounted inside the container.' },
          { link: { href: '/almacenamiento', label: 'Go to Storage' } },
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
          { p: 'Back up these Docker volumes: <b>noctcom_postgres_data</b> (database) and <b>noctcom_minio_data</b> (encrypted blobs).' },
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
