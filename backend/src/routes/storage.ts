import type { FastifyPluginAsync } from 'fastify';
import { promises as fs } from 'node:fs';
import { execFile as execFileCb, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { redis } from '../db/redis.js';
import { activeDiskUsage } from '../storage/capacity.js';
import { validateVolumePath } from '../storage/disk.js';
import { env } from '../config.js';
import * as registry from '../agents/registry.js';

const execFile = promisify(execFileCb);

interface DiskInfo {
  id: string;
  device: string;
  path: string;
  label: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  filesystem: string;
  removable: boolean;
  active: boolean;
  mounted: boolean;
  needsFormat: boolean;
}

const COMPATIBLE_FS = new Set(['ext4', 'xfs']);
const USABLE_FS = new Set(['ext4', 'xfs', 'ntfs', 'fat32', 'vfat', 'FAT32', 'FAT', 'NTFS', 'exfat', 'exFAT', 'fuseblk']);

const PROTECTED_MOUNTS = new Set([
  '/', '/boot', '/boot/efi', '/home', '/var', '/usr', '/etc', '/snap', '/tmp',
]);

function formatLabel(path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function detectDisksLinux(): Promise<DiskInfo[]> {
  try {
    const output = execSync(
      "lsblk -Jbo NAME,SIZE,FSAVAIL,FSSIZE,FSUSED,FSTYPE,MOUNTPOINT,RM,LABEL,TYPE -p 2>/dev/null || echo '{\"blockdevices\":[]}'",
      { encoding: 'utf-8', timeout: 5000 },
    );
    const parsed = JSON.parse(output);
    const disks: DiskInfo[] = [];

    for (const dev of parsed.blockdevices ?? []) {
      if (dev.type === 'loop' || dev.type === 'rom') continue;

      const targets = dev.children ?? [dev];
      for (const part of targets) {
        if (part.type === 'loop' || part.type === 'rom') continue;

        const mountpoint = part.mountpoint ?? '';
        if (PROTECTED_MOUNTS.has(mountpoint)) continue;

        const isMounted = !!mountpoint;
        const fstype = part.fstype || 'none';
        const needsFormat = !USABLE_FS.has(fstype);
        const totalBytes = isMounted && part.fssize ? Number(part.fssize) : Number(part.size) || 0;
        const freeBytes = isMounted && part.fsavail ? Number(part.fsavail) : 0;
        const usedBytes = isMounted && part.fsused ? Number(part.fsused) : 0;

        if (totalBytes === 0) continue;

        disks.push({
          id: part.name.replace('/dev/', ''),
          device: part.name,
          path: mountpoint,
          label: part.label || (mountpoint ? formatLabel(mountpoint) : part.name.replace('/dev/', '')),
          totalBytes,
          freeBytes,
          usedBytes: usedBytes || (totalBytes - freeBytes),
          filesystem: fstype,
          removable: part.rm === true || part.rm === '1' || dev.rm === true || dev.rm === '1',
          active: false,
          mounted: isMounted,
          needsFormat,
        });
      }
    }
    return disks;
  } catch {
    return [];
  }
}

async function detectDisksWindows(): Promise<DiskInfo[]> {
  try {
    const output = execSync(
      'wmic logicaldisk get Caption,FreeSpace,Size,FileSystem,DriveType /format:csv 2>nul',
      { encoding: 'utf-8', timeout: 5000 },
    );
    const lines = output.trim().split('\n').filter((l) => l.includes(','));
    const disks: DiskInfo[] = [];

    for (const line of lines.slice(1)) {
      const [, caption, driveType, fileSystem, freeSpace, size] = line.split(',').map((s) => s.trim());
      if (!size || !caption || size === '') continue;
      const total = Number(size);
      const free = Number(freeSpace) || 0;
      if (total === 0) continue;

      const fs = fileSystem || 'unknown';
      disks.push({
        id: caption.replace(':', '').toLowerCase(),
        device: caption,
        path: caption + '\\',
        label: `Disco ${caption}`,
        totalBytes: total,
        freeBytes: free,
        usedBytes: total - free,
        filesystem: fs,
        removable: driveType === '2',
        active: false,
        mounted: true,
        needsFormat: !USABLE_FS.has(fs),
      });
    }
    return disks;
  } catch {
    return [];
  }
}

async function detectMountedVolumes(): Promise<DiskInfo[]> {
  const scanPaths = ['/mnt', '/media', '/volumes'];
  const disks: DiskInfo[] = [];

  for (const base of scanPaths) {
    try {
      const entries = await fs.readdir(base, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = `${base}/${entry.name}`;
        try {
          const stat = await fs.statfs(fullPath);
          const total = stat.bsize * stat.blocks;
          const free = stat.bsize * stat.bfree;
          if (total === 0) continue;

          disks.push({
            id: `${base.slice(1)}-${entry.name}`.replace(/\//g, '-'),
            device: '',
            path: fullPath,
            label: formatLabel(entry.name),
            totalBytes: total,
            freeBytes: free,
            usedBytes: total - free,
            filesystem: 'auto',
            removable: base === '/media',
            active: false,
            mounted: true,
            needsFormat: false,
          });
        } catch { /* skip unmountable */ }
      }
    } catch { /* path doesn't exist */ }
  }
  return disks;
}

async function getRootDevice(): Promise<string> {
  try {
    const { stdout } = await execFile('findmnt', ['-no', 'SOURCE', '/']);
    const rootPart = stdout.trim();
    const { stdout: parentOut } = await execFile('lsblk', ['-no', 'PKNAME', rootPart]);
    return `/dev/${parentOut.trim()}`;
  } catch {
    return '';
  }
}

// ─── Schemas ─────────────────────────────────────────────────

const DEVICE_REGEX = /^\/dev\/(sd[a-z]\d?|nvme\d+n\d+(p\d+)?|vd[a-z]\d?|xvd[a-z]\d?)$/;

const formatDiskSchema = z.object({
  device: z.string().min(4).max(64).regex(DEVICE_REGEX, 'ruta de dispositivo invalida'),
  filesystem: z.enum(['ext4', 'xfs']),
  label: z.string().min(1).max(12).regex(/^[a-zA-Z0-9_-]+$/, 'solo alfanumerico, guion y guion bajo'),
  confirmLabel: z.string(),
});

const mountDiskSchema = z.object({
  device: z.string().min(4).max(64).regex(DEVICE_REGEX, 'ruta de dispositivo invalida'),
  label: z.string().min(1).max(12).regex(/^[a-zA-Z0-9_-]+$/),
});

const volumeSchema = z.object({
  path: z.string().min(1).max(1024),
  label: z.string().min(1).max(128),
});

// ─── Routes ──────────────────────────────────────────────────

const storageRoutes: FastifyPluginAsync = async (app) => {

  // Exige un token de step-up (re-autenticación reciente) en la cabecera
  // x-step-up-token para operaciones destructivas. Devuelve 'step-up-required'
  // para que el cliente lance el flujo de re-auth y reintente.
  async function requireStepUp(req: any, reply: any): Promise<boolean> {
    const token = req.headers['x-step-up-token'];
    if (typeof token !== 'string') {
      reply.code(401).send({ error: 'step-up-required', message: 'se requiere re-autenticación' });
      return false;
    }
    try {
      const d = app.jwt.verify(token) as { sub: string; scope?: string };
      if (d.scope !== 'step-up' || d.sub !== req.user.sub) {
        reply.code(401).send({ error: 'step-up-required', message: 'token de step-up inválido' });
        return false;
      }
    } catch {
      reply.code(401).send({ error: 'step-up-required', message: 'token de step-up expirado' });
      return false;
    }
    return true;
  }

  // ─── Disk discovery ──────────────────────────────────────

  app.get<{ Querystring: { agentId?: string } }>(
    '/disks',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
    // Si se pide un agente concreto, el listado se enruta a SU máquina (cloud).
    // Sin agentId, el flujo local de siempre (self-host: discos del backend).
    const agentId = req.query.agentId;
    if (agentId) {
      const a = await db.query(
        `SELECT id FROM agents WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [agentId, req.user.sub],
      );
      if (a.rowCount === 0) return reply.notFound('agente no encontrado');
      if (!registry.isOnline(agentId)) {
        return reply.code(409).send({ error: 'agent-offline', message: 'el agente no está conectado' });
      }
      let disks: DiskInfo[];
      try {
        const result = (await registry.sendCommand(agentId, 'list-disks', {})) as { disks?: DiskInfo[] };
        disks = result?.disks ?? [];
      } catch (err: any) {
        req.log.warn({ err: err?.message }, 'list-disks vía agente falló');
        return reply.code(504).send({ error: 'agent-error', message: 'el agente no respondió a tiempo' });
      }
      // Marca como activos los discos ya registrados como volumen de este agente.
      try {
        const vols = await db.query(
          `SELECT path FROM storage_volumes WHERE agent_id = $1 AND active = true`,
          [agentId],
        );
        const activePaths = new Set(vols.rows.map((v: any) => v.path));
        for (const d of disks) if (activePaths.has(d.path)) d.active = true;
      } catch { /* sin volúmenes registrados / tabla aún sin columna */ }
      return reply.send({ disks });
    }

    let disks: DiskInfo[];

    if (os.platform() === 'win32') {
      disks = await detectDisksWindows();
    } else {
      disks = await detectDisksLinux();
      const mounted = await detectMountedVolumes();
      const seen = new Set(disks.map((d) => d.device || d.path));
      for (const m of mounted) {
        if (!seen.has(m.path)) disks.push(m);
      }
    }

    try {
      const volumes = await db.query(
        `SELECT path FROM storage_volumes WHERE active = true`,
      );
      const activePaths = new Set(volumes.rows.map((v: any) => v.path));
      for (const d of disks) {
        if (activePaths.has(d.path)) d.active = true;
      }
    } catch { /* table may not exist yet */ }

    return reply.send({ disks });
  });

  // ─── Usar un disco del agente como volumen (M2, no destructivo) ──
  // "Usar este disco": el agente crea una carpeta noctcom-blobs/ en el disco y
  // lo registramos como volumen del usuario. NO formatea ni borra nada. Los
  // blobs que se guarden ahí (M3) ya van cifrados → sigue siendo zero-knowledge.

  const useDiskSchema = z.object({
    agentId: z.string().uuid(),
    path: z.string().min(1).max(1024),
    label: z.string().min(1).max(128),
    // Capacidad del disco (la conoce el cliente por el listado del agente). Solo
    // para mostrar el almacenamiento total del usuario; no es un límite real.
    totalBytes: z.number().int().nonnegative().optional(),
  });
  const unuseDiskSchema = z.object({
    agentId: z.string().uuid(),
    path: z.string().min(1).max(1024),
  });

  async function ownedOnlineAgent(req: any, reply: any, agentId: string): Promise<boolean> {
    const a = await db.query(
      `SELECT id FROM agents WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [agentId, req.user.sub],
    );
    if (a.rowCount === 0) { reply.notFound('agente no encontrado'); return false; }
    if (!registry.isOnline(agentId)) {
      reply.code(409).send({ error: 'agent-offline', message: 'el agente no está conectado' });
      return false;
    }
    return true;
  }

  app.post('/disks/use', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = useDiskSchema.parse(req.body);
    if (!(await ownedOnlineAgent(req, reply, body.agentId))) return;

    let result: { path?: string; blobPath?: string };
    try {
      result = (await registry.sendCommand(body.agentId, 'register-volume', { path: body.path })) as {
        path?: string;
        blobPath?: string;
      };
    } catch (err: any) {
      req.log.warn({ err: err?.message }, 'register-volume vía agente falló');
      return reply.code(502).send({
        error: 'agent-error',
        message: err?.message ?? 'el agente no pudo preparar el disco',
      });
    }

    const volPath = result?.path ?? body.path;
    // Idempotente: si ya está registrado en este agente, lo reactivamos.
    const existing = await db.query(
      `SELECT id FROM storage_volumes WHERE agent_id = $1 AND path = $2`,
      [body.agentId, volPath],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await db.query(
        `UPDATE storage_volumes SET active = true, label = $2, total_bytes = $3 WHERE id = $1`,
        [existing.rows[0].id, body.label, body.totalBytes ?? 0],
      );
      return reply.send({ id: existing.rows[0].id, path: volPath, alreadyRegistered: true });
    }

    const r = await db.query(
      `INSERT INTO storage_volumes (path, label, agent_id, user_id, active, total_bytes)
       VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
      [volPath, body.label, body.agentId, req.user.sub, body.totalBytes ?? 0],
    );
    return reply.code(201).send({ id: r.rows[0].id, path: volPath });
  });

  // "Dejar de usar": da de baja el volumen (no toca los datos del disco). Solo
  // si aún no guarda chunks; si ya hay datos, hay que migrarlos primero.
  app.post('/disks/unuse', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = unuseDiskSchema.parse(req.body);
    const vol = await db.query(
      `SELECT id FROM storage_volumes WHERE agent_id = $1 AND path = $2 AND user_id = $3`,
      [body.agentId, body.path, req.user.sub],
    );
    if (vol.rowCount === 0) return reply.notFound('volumen no encontrado');
    const volId = vol.rows[0].id;

    const hasChunks = await db.query(`SELECT 1 FROM chunks WHERE volume_id = $1 LIMIT 1`, [volId]);
    if (hasChunks.rowCount && hasChunks.rowCount > 0) {
      return reply.badRequest('el volumen ya guarda archivos — migra o elimínalos primero');
    }
    await db.query(`DELETE FROM storage_volumes WHERE id = $1`, [volId]);
    return reply.send({ ok: true });
  });

  // ─── Formatear un disco del agente (M2b, DESTRUCTIVO) ────────────
  // Formatea un disco de la máquina del usuario a través de su agente y lo deja
  // listo como volumen activo. Acotado: nunca el disco de sistema, solo discos
  // vacíos (lo verifica el propio agente), step-up 2FA + confirmación de
  // etiqueta. Los datos que se guarden después van cifrados (zero-knowledge).
  const agentFormatSchema = z.object({
    agentId: z.string().uuid(),
    driveLetter: z.string().regex(/^[A-Za-z]$/, 'letra de unidad inválida'),
    label: z.string().min(1).max(12).regex(/^[a-zA-Z0-9_-]+$/, 'solo alfanumérico, guion y guion bajo'),
    confirmLabel: z.string(),
    totalBytes: z.number().int().nonnegative().optional(),
  });

  app.post('/disks/agent-format', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = agentFormatSchema.parse(req.body);
    if (body.confirmLabel !== body.label) {
      return reply.badRequest('la etiqueta de confirmación no coincide');
    }
    const letter = body.driveLetter.toUpperCase();
    if (letter === 'C') {
      return reply.badRequest('no se puede formatear el disco del sistema (C:)');
    }
    if (!(await ownedOnlineAgent(req, reply, body.agentId))) return;
    // Operación irreversible → re-autenticación reciente obligatoria.
    if (!(await requireStepUp(req, reply))) return;

    // Se puede formatear un disco aunque esté EN USO (activo), pero nunca si ya
    // guarda archivos de Noctcom: eso destruiría datos del usuario y dejaría
    // chunks huérfanos. En ese caso hay que eliminarlos / dejar de usar primero.
    const targetPath = `${letter}:\\`;
    const existingVol = await db.query(
      `SELECT id FROM storage_volumes WHERE agent_id = $1 AND path = $2 AND user_id = $3`,
      [body.agentId, targetPath, req.user.sub],
    );
    if (existingVol.rowCount && existingVol.rowCount > 0) {
      const hasChunks = await db.query(
        `SELECT 1 FROM chunks WHERE volume_id = $1 LIMIT 1`,
        [existingVol.rows[0].id],
      );
      if (hasChunks.rowCount && hasChunks.rowCount > 0) {
        return reply.badRequest(
          'este disco ya guarda archivos de Noctcom; elimínalos o déjalo de usar antes de formatear',
        );
      }
    }

    let result: { path?: string; blobPath?: string };
    try {
      result = (await registry.sendCommand(
        body.agentId,
        'format-volume',
        { driveLetter: letter, label: body.label },
        180_000,
      )) as { path?: string; blobPath?: string };
    } catch (err: any) {
      req.log.warn({ err: err?.message }, 'format-volume vía agente falló');
      return reply.code(502).send({
        error: 'agent-error',
        message: err?.message ?? 'el agente no pudo formatear el disco',
      });
    }

    const volPath = result?.path ?? `${letter}:\\`;
    // Idempotente: si ese volumen ya estaba registrado en el agente, reactívalo.
    const existing = await db.query(
      `SELECT id FROM storage_volumes WHERE agent_id = $1 AND path = $2`,
      [body.agentId, volPath],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await db.query(
        `UPDATE storage_volumes SET active = true, label = $2, total_bytes = $3 WHERE id = $1`,
        [existing.rows[0].id, body.label, body.totalBytes ?? 0],
      );
      return reply.send({ id: existing.rows[0].id, path: volPath, alreadyRegistered: true });
    }
    const r = await db.query(
      `INSERT INTO storage_volumes (path, label, agent_id, user_id, active, total_bytes)
       VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
      [volPath, body.label, body.agentId, req.user.sub, body.totalBytes ?? 0],
    );
    return reply.code(201).send({ id: r.rows[0].id, path: volPath });
  });

  // ─── Señalización WebRTC (vía directa, "Tus discos") ─────────────
  // El navegador establece un DataChannel P2P con el agente para que los blobs
  // cifrados viajen DIRECTOS (no relayados por el backend → sin coste de egress
  // recurrente, lo que hace sostenible el desbloqueo de por vida). El backend
  // solo hace de señalización: reenvía la oferta SDP al agente y devuelve su
  // respuesta. Sin trickle: el agente reúne sus candidatos ICE y los incluye en
  // la SDP de respuesta (mantiene este intercambio en una sola ida y vuelta).
  //
  // Degradación: si el agente no soporta WebRTC todavía (responde supported:false)
  // o falla, el cliente cae al relay HTTP de siempre (PUT/GET /uploads/chunk).
  const rtcOfferSchema = z.object({
    agentId: z.string().uuid(),
    offer: z.string().min(1).max(64 * 1024), // SDP de oferta del navegador
  });

  app.post('/agent-rtc/offer', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = rtcOfferSchema.parse(req.body);
    if (!(await ownedOnlineAgent(req, reply, body.agentId))) return;
    let res: { answer?: string; supported?: boolean };
    try {
      res = (await registry.sendCommand(
        body.agentId,
        'rtc-offer',
        { offer: body.offer },
        30_000,
      )) as { answer?: string; supported?: boolean };
    } catch (err: any) {
      req.log.warn({ err: err?.message }, 'rtc-offer vía agente falló');
      // 502: el cliente caerá al relay.
      return reply.code(502).send({ error: 'agent-error', message: 'el agente no negoció la conexión directa' });
    }
    if (!res?.answer || res.supported === false) {
      // El agente está conectado pero no habla WebRTC (versión antigua): el
      // cliente debe usar el relay. 409 = "no disponible, usa el fallback".
      return reply.code(409).send({ error: 'rtc-unsupported', message: 'el agente no soporta conexión directa' });
    }
    return reply.send({ answer: res.answer });
  });

  // ─── Format disk ─────────────────────────────────────────

  app.post('/disks/format', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (os.platform() === 'win32') {
      return reply.badRequest('el formateo de discos solo esta disponible en Linux');
    }

    const body = formatDiskSchema.parse(req.body);

    if (body.confirmLabel !== body.label) {
      return reply.badRequest('la etiqueta de confirmacion no coincide');
    }

    // Admin check
    const adminCheck = await db.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [(req as any).user.sub],
    );
    if (!adminCheck.rows[0]?.is_admin) {
      return reply.forbidden('se requiere acceso de administrador');
    }

    // Re-autenticación reciente obligatoria para una operación irreversible.
    if (!(await requireStepUp(req, reply))) return;

    // Resolve symlinks
    let realDevice: string;
    try {
      realDevice = await fs.realpath(body.device);
    } catch {
      return reply.badRequest('el dispositivo no existe');
    }
    if (!realDevice.startsWith('/dev/')) {
      return reply.badRequest('ruta de dispositivo invalida');
    }

    // Verify device via lsblk
    let deviceInfo: any;
    try {
      const { stdout } = await execFile('lsblk', [
        '-Jbo', 'NAME,SIZE,FSTYPE,MOUNTPOINT,RM,TYPE', '-p', realDevice,
      ]);
      const parsed = JSON.parse(stdout);
      deviceInfo = parsed.blockdevices?.[0];
    } catch {
      return reply.badRequest('no se pudo leer informacion del dispositivo');
    }

    if (!deviceInfo) {
      return reply.badRequest('dispositivo no encontrado');
    }

    // Protect system disk
    const rootDev = await getRootDevice();
    if (rootDev && (realDevice === rootDev || realDevice.startsWith(rootDev))) {
      return reply.badRequest('no se puede formatear el disco del sistema');
    }

    // Check mounted at protected paths
    const allParts = deviceInfo.children ?? [deviceInfo];
    for (const p of allParts) {
      if (p.mountpoint && PROTECTED_MOUNTS.has(p.mountpoint)) {
        return reply.badRequest(`el dispositivo tiene particiones montadas en rutas protegidas (${p.mountpoint})`);
      }
    }

    // Check no registered volume points to this device
    const existingVols = await db.query('SELECT path FROM storage_volumes');
    for (const p of allParts) {
      if (p.mountpoint && existingVols.rows.some((v: any) => v.path === p.mountpoint)) {
        return reply.conflict('el dispositivo tiene un volumen registrado — eliminalo primero');
      }
    }

    const mountPath = `/mnt/noctcom-${body.label}`;
    const userId = (req as any).user.sub;

    try {
      // Unmount if mounted
      for (const p of allParts) {
        if (p.mountpoint) {
          try {
            await execFile('sudo', ['umount', p.name ?? realDevice], { timeout: 10000 });
          } catch { /* may not be mounted */ }
        }
      }

      // Wipe filesystem signatures
      await execFile('sudo', ['wipefs', '-a', realDevice], { timeout: 10000 });

      // Format
      if (body.filesystem === 'ext4') {
        await execFile('sudo', ['mkfs.ext4', '-F', '-L', body.label, realDevice], { timeout: 120000 });
      } else {
        await execFile('sudo', ['mkfs.xfs', '-f', '-L', body.label, realDevice], { timeout: 120000 });
      }

      // Mount
      await execFile('sudo', ['mkdir', '-p', mountPath], { timeout: 5000 });
      await execFile('sudo', ['mount', realDevice, mountPath], { timeout: 10000 });
      await execFile('sudo', ['chmod', '755', mountPath], { timeout: 5000 });

      // Validate and create blob directory
      const valid = await validateVolumePath(mountPath);
      if (!valid) {
        throw new Error('no se pudo crear el directorio de blobs en el volumen');
      }

      // Log success
      await db.query(
        `INSERT INTO disk_format_log (user_id, device, filesystem, label, mount_path, status)
         VALUES ($1, $2, $3, $4, $5, 'success')`,
        [userId, realDevice, body.filesystem, body.label, mountPath],
      );

      return reply.send({
        ok: true,
        mountPath,
        device: realDevice,
        filesystem: body.filesystem,
      });
    } catch (err: any) {
      // Log failure
      try {
        await db.query(
          `INSERT INTO disk_format_log (user_id, device, filesystem, label, mount_path, status, error)
           VALUES ($1, $2, $3, $4, $5, 'failed', $6)`,
          [userId, realDevice, body.filesystem, body.label, mountPath, err.message ?? 'unknown'],
        );
      } catch { /* best effort logging */ }

      app.log.error({ err, device: realDevice }, 'disk format failed');
      return reply.internalServerError(`error al formatear: ${err.message ?? 'desconocido'}`);
    }
  });

  // ─── Mount disk ──────────────────────────────────────────

  app.post('/disks/mount', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (os.platform() === 'win32') {
      return reply.badRequest('el montaje de discos solo esta disponible en Linux');
    }

    const body = mountDiskSchema.parse(req.body);

    const adminCheck = await db.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [(req as any).user.sub],
    );
    if (!adminCheck.rows[0]?.is_admin) {
      return reply.forbidden('se requiere acceso de administrador');
    }

    let realDevice: string;
    try {
      realDevice = await fs.realpath(body.device);
    } catch {
      return reply.badRequest('el dispositivo no existe');
    }

    try {
      const { stdout } = await execFile('lsblk', ['-no', 'FSTYPE', realDevice]);
      const fstype = stdout.trim();
      if (!USABLE_FS.has(fstype)) {
        return reply.badRequest(`filesystem incompatible (${fstype})`);
      }
    } catch {
      return reply.badRequest('no se pudo leer el filesystem del dispositivo');
    }

    const mountPath = `/mnt/noctcom-${body.label}`;

    try {
      await execFile('sudo', ['mkdir', '-p', mountPath], { timeout: 5000 });
      await execFile('sudo', ['mount', realDevice, mountPath], { timeout: 10000 });
      await execFile('sudo', ['chmod', '755', mountPath], { timeout: 5000 });

      const valid = await validateVolumePath(mountPath);
      if (!valid) {
        throw new Error('no se pudo crear el directorio de blobs');
      }

      return reply.send({ ok: true, mountPath, device: realDevice });
    } catch (err: any) {
      app.log.error({ err, device: realDevice }, 'disk mount failed');
      return reply.internalServerError(`error al montar: ${err.message ?? 'desconocido'}`);
    }
  });

  // ─── Storage summary ─────────────────────────────────────

  app.get('/summary', { onRequest: [app.authenticate] }, async (req, reply) => {
    // En self-host (sin Stripe) tanto la capacidad como el uso son los REALES de
    // los discos del operador (statfs), no una cuota de plan ni el contador de
    // chunks: así el hero del panel cuadra exactamente con la tarjeta de cada
    // disco (GET /volumes) y con el texto «capacidad real, sin cuotas
    // artificiales». En la nube se mantiene la cuota del plan y storage_used_bytes.
    const userId = (req as any).user.sub;
    const r = await db.query(
      `SELECT storage_used_bytes, storage_quota_bytes FROM users WHERE id = $1`,
      [userId],
    );
    if (r.rowCount === 0) return reply.notFound();
    const row = r.rows[0];
    if (!env.STRIPE_SECRET_KEY) {
      const usage = await activeDiskUsage(userId);
      return reply.send({ usedBytes: usage.usedBytes, quotaBytes: usage.totalBytes });
    }
    return reply.send({
      usedBytes: Number(row.storage_used_bytes),
      quotaBytes: Number(row.storage_quota_bytes),
    });
  });

  // ─── Stack health (self-host dashboard) ───────────────────
  // Alimenta los chips del panel self-host. Vive bajo /api/v1/storage (lo
  // enruta Caddy a /api), a diferencia de /health que está en la raíz y no es
  // alcanzable desde el origen de la app en modo LAN.
  //
  // Honestidad: el backend NO tiene docker.sock montado, así que no puede
  // inspeccionar contenedores. Comprueba de verdad lo que sí alcanza por red
  // (Postgres, Redis, MinIO) e infiere los dos restantes:
  //   · backend → ok (si corre este handler, está vivo).
  //   · caddy   → ok (la petición llegó por su reverse proxy).
  app.get('/stack-health', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const check = async (fn: () => Promise<unknown>): Promise<'ok' | 'down'> => {
      try { await fn(); return 'ok'; } catch { return 'down'; }
    };

    const postgres = await check(() => db.query('SELECT 1'));

    const r = redis();
    // Redis ausente (REDIS_URL sin configurar) = sync desactivado a propósito,
    // no es un fallo del stack → ok, igual que en /health.
    const redisStatus = r ? await check(() => r.ping()) : 'ok';

    const minio = await check(async () => {
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
      const { s3 } = await import('../storage/s3.js');
      await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    });

    return reply.send([
      { service: 'postgres', status: postgres },
      { service: 'redis', status: redisStatus },
      { service: 'minio', status: minio },
      { service: 'backend', status: 'ok' },
      { service: 'caddy', status: 'ok' },
    ]);
  });

  // ─── Volume management ─────────────────────────────────────

  app.get('/volumes', { onRequest: [app.authenticate] }, async (req, reply) => {
    // Acotado al usuario: sus volúmenes de agente (user_id propio) + los locales
    // del backend en self-host (user_id NULL). Nunca los de otras cuentas.
    const r = await db.query(
      `SELECT id, path, label, active, created_at FROM storage_volumes
        WHERE user_id = $1 OR user_id IS NULL
        ORDER BY created_at ASC`,
      [req.user.sub],
    );

    const volumes = await Promise.all(r.rows.map(async (v: any) => {
      let freeBytes = 0;
      let totalBytes = 0;
      try {
        const stat = await fs.statfs(v.path);
        totalBytes = stat.bsize * stat.blocks;
        freeBytes = stat.bsize * stat.bfree;
      } catch { /* disk may be disconnected */ }

      return {
        id: v.id,
        path: v.path,
        label: v.label,
        active: v.active,
        totalBytes,
        freeBytes,
        usedBytes: totalBytes - freeBytes,
        createdAt: v.created_at.toISOString(),
      };
    }));

    return reply.send(volumes);
  });

  app.post('/volumes', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = volumeSchema.parse(req.body);

    const valid = await validateVolumePath(body.path);
    if (!valid) return reply.badRequest('path is not a writable directory');

    const existing = await db.query(
      `SELECT 1 FROM storage_volumes WHERE path = $1`, [body.path],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.conflict('volume already registered');
    }

    const r = await db.query(
      `INSERT INTO storage_volumes (path, label) VALUES ($1, $2) RETURNING id`,
      [body.path, body.label],
    );

    return reply.code(201).send({ id: r.rows[0].id });
  });

  app.patch<{ Params: { id: string } }>(
    '/volumes/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { active } = z.object({ active: z.boolean() }).parse(req.body);
      const r = await db.query(
        `UPDATE storage_volumes SET active = $1 WHERE id = $2 RETURNING id`,
        [active, req.params.id],
      );
      if (r.rowCount === 0) return reply.notFound();
      return reply.send({ ok: true });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/volumes/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      if (!(await requireStepUp(req, reply))) return;

      const hasChunks = await db.query(
        `SELECT 1 FROM chunks WHERE volume_id = $1 LIMIT 1`,
        [req.params.id],
      );
      if (hasChunks.rowCount && hasChunks.rowCount > 0) {
        return reply.badRequest('volume has stored chunks — migrate or delete files first');
      }

      const r = await db.query(
        `DELETE FROM storage_volumes WHERE id = $1 RETURNING id`,
        [req.params.id],
      );
      if (r.rowCount === 0) return reply.notFound();
      return reply.send({ ok: true });
    },
  );
};

export default storageRoutes;
