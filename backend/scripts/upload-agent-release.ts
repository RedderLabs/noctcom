/**
 * Sube un binario del agente "Noctcom Connector" a B2 para que la web lo
 * ofrezca como descarga.
 *   npx tsx --env-file=.env.prod scripts/upload-agent-release.ts windows [ruta]
 *
 * La descarga se sirve vía GET /api/v1/agent/download?platform=… (URL firmada).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../src/storage/s3.js';
import { env } from '../src/config.js';

interface Target {
  defaultFile: string;
  key: string;
  filename: string;
  contentType: string;
}

const TARGETS: Record<string, Target> = {
  windows: {
    defaultFile: '../agent/target/release/noctcom-connector.exe',
    key: 'downloads/noctcom-connector-windows.exe',
    filename: 'noctcom-connector.exe',
    contentType: 'application/vnd.microsoft.portable-executable',
  },
  linux: {
    defaultFile: '../agent/target/release/noctcom-connector',
    key: 'downloads/noctcom-connector-linux',
    filename: 'noctcom-connector',
    contentType: 'application/octet-stream',
  },
  macos: {
    defaultFile: '../agent/target/release/noctcom-connector',
    key: 'downloads/noctcom-connector-macos',
    filename: 'noctcom-connector',
    contentType: 'application/octet-stream',
  },
};

const platform = process.argv[2];
const t = platform ? TARGETS[platform] : undefined;
if (!t) {
  console.error(`Uso: upload-agent-release.ts <windows|linux|macos> [ruta]`);
  process.exit(1);
}

const file = resolve(process.cwd(), process.argv[3] ?? t.defaultFile);
const body = readFileSync(file);

await s3.send(
  new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: t.key,
    Body: body,
    ContentType: t.contentType,
    ContentDisposition: `attachment; filename="${t.filename}"`,
  }),
);

console.log(`✓ Subido ${file} (${(body.length / 1024 / 1024).toFixed(1)} MB) → ${env.S3_BUCKET}/${t.key}`);
