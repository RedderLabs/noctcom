import type { FastifyPluginAsync } from 'fastify';
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { validateVolumePath } from '../storage/disk.js';

interface DiskInfo {
  id: string;
  path: string;
  label: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  filesystem: string;
  removable: boolean;
  active: boolean;
}

function formatLabel(path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function detectDisksLinux(): Promise<DiskInfo[]> {
  try {
    const output = execSync(
      "lsblk -Jbo NAME,SIZE,FSAVAIL,FSSIZE,FSUSED,FSTYPE,MOUNTPOINT,RM,LABEL 2>/dev/null || echo '{\"blockdevices\":[]}'",
      { encoding: 'utf-8', timeout: 5000 },
    );
    const parsed = JSON.parse(output);
    const disks: DiskInfo[] = [];

    for (const dev of parsed.blockdevices ?? []) {
      const targets = dev.children ?? [dev];
      for (const part of targets) {
        if (!part.mountpoint || part.mountpoint === '/' || part.mountpoint.startsWith('/boot') || part.mountpoint.startsWith('/snap')) continue;
        if (!part.fssize || part.fssize === 0) continue;

        disks.push({
          id: part.name,
          path: part.mountpoint,
          label: part.label || formatLabel(part.mountpoint),
          totalBytes: Number(part.fssize) || 0,
          freeBytes: Number(part.fsavail) || 0,
          usedBytes: Number(part.fsused) || 0,
          filesystem: part.fstype || 'unknown',
          removable: part.rm === true || part.rm === '1',
          active: false,
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
        path: caption + '\\',
        label: `Disco ${caption}`,
        totalBytes: total,
        freeBytes: free,
        usedBytes: total - free,
        filesystem: fileSystem || 'unknown',
        removable: driveType === '2',
        active: false,
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
            path: fullPath,
            label: formatLabel(entry.name),
            totalBytes: total,
            freeBytes: free,
            usedBytes: total - free,
            filesystem: 'auto',
            removable: base === '/media',
            active: false,
          });
        } catch { /* skip unmountable */ }
      }
    } catch { /* path doesn't exist */ }
  }
  return disks;
}

const storageRoutes: FastifyPluginAsync = async (app) => {

  app.get('/disks', { onRequest: [app.authenticate] }, async (_req, reply) => {
    let disks: DiskInfo[];

    if (os.platform() === 'win32') {
      disks = await detectDisksWindows();
    } else {
      disks = await detectDisksLinux();
      const mounted = await detectMountedVolumes();
      const seen = new Set(disks.map((d) => d.path));
      for (const m of mounted) {
        if (!seen.has(m.path)) disks.push(m);
      }
    }

    try {
      const volumes = await db.query(
        `SELECT path FROM storage_volumes WHERE active = true`,
      );
      const activePaths = new Set(volumes.rows.map((v) => v.path));
      for (const d of disks) {
        if (activePaths.has(d.path)) d.active = true;
      }
    } catch { /* table may not exist yet */ }

    return reply.send({ disks });
  });

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

  const volumeSchema = z.object({
    path: z.string().min(1).max(1024),
    label: z.string().min(1).max(128),
  });

  app.get('/volumes', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const r = await db.query(
      `SELECT id, path, label, active, created_at FROM storage_volumes ORDER BY created_at ASC`,
    );

    const volumes = await Promise.all(r.rows.map(async (v) => {
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
