import { promises as fs } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { randomBytes } from 'node:crypto';

const BLOB_DIR = 'noctcom-blobs';

function blobPath(volumePath: string, key: string): string {
  const full = resolve(join(volumePath, BLOB_DIR, key));
  const base = resolve(join(volumePath, BLOB_DIR));
  if (!full.startsWith(base)) throw new Error('path traversal detected');
  return full;
}

export function generateDiskKey(): string {
  const prefix = randomBytes(1).toString('hex');
  const name = randomBytes(16).toString('hex');
  return `${prefix}/${name}`;
}

export async function writeToDisk(volumePath: string, key: string, data: Buffer): Promise<void> {
  const filePath = blobPath(volumePath, key);
  await fs.mkdir(join(filePath, '..'), { recursive: true });
  await fs.writeFile(filePath, data);
}

export async function readFromDisk(volumePath: string, key: string): Promise<Buffer> {
  return fs.readFile(blobPath(volumePath, key));
}

export async function deleteFromDisk(volumePath: string, key: string): Promise<void> {
  try {
    await fs.unlink(blobPath(volumePath, key));
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export async function validateVolumePath(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    if (!stat.isDirectory()) return false;
    const testFile = join(path, BLOB_DIR, '.noctcom-write-test');
    await fs.mkdir(join(path, BLOB_DIR), { recursive: true });
    await fs.writeFile(testFile, 'ok');
    await fs.unlink(testFile);
    return true;
  } catch {
    return false;
  }
}
