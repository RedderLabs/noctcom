import type { FastifyPluginAsync } from 'fastify';
import { promises as fs } from 'node:fs';
import { execFile as execFileCb, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { validateVolumePath } from '../storage/disk.js';

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
        const needsFormat = !COMPATIBLE_FS.has(fstype);
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

      disks.push({
        id: caption.replace(':', '').toLowerCase(),
        device: caption,
        path: caption + '\\',
        label: `Disco ${caption}`,
        totalBytes: total,
        freeBytes: free,
        usedBytes: total - free,
        filesystem: fileSystem || 'unknown',
        removable: driveType === '2',
        active: false,
        mounted: true,
        needsFormat: false,
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

  // ─── Disk discovery ──────────────────────────────────────

  app.get('/disks', { onRequest: [app.authenticate] }, async (_req, reply) => {
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

    // Verify it has a compatible filesystem
    try {
      const { stdout } = await execFile('lsblk', ['-no', 'FSTYPE', realDevice]);
      const fstype = stdout.trim();
      if (!COMPATIBLE_FS.has(fstype)) {
        return reply.badRequest(`filesystem incompatible (${fstype}) — se requiere ext4 o xfs`);
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
    const r = await db.query(
      'SELECT storage_used_bytes, storage_quota_bytes FROM users WHERE id = $1',
      [(req as any).user.sub],
    );
    if (r.rowCount === 0) return reply.notFound();
    const row = r.rows[0];
    return reply.send({
      usedBytes: Number(row.storage_used_bytes),
      quotaBytes: Number(row.storage_quota_bytes),
    });
  });

  // ─── Volume management ─────────────────────────────────────

  app.get('/volumes', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const r = await db.query(
      `SELECT id, path, label, active, created_at FROM storage_volumes ORDER BY created_at ASC`,
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
