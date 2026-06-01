/**
 * Prueba de extremo a extremo del almacenamiento (bucket S3/B2).
 * Replica el flujo real de la app: subida DIRECTA por URL prefirmada.
 *
 * Lee las credenciales del entorno (no se hardcodean):
 *   S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
 *
 * Uso:
 *   npx tsx --env-file=.env.b2 scripts/test-b2.ts
 */
import {
  S3Client, HeadBucketCommand, PutObjectCommand,
  GetObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';

function need(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`✗ falta la variable ${name}`); process.exit(1); }
  return v;
}

const ENDPOINT = need('S3_ENDPOINT');
const REGION = need('S3_REGION');
const BUCKET = need('S3_BUCKET');

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: need('S3_ACCESS_KEY'), secretAccessKey: need('S3_SECRET_KEY') },
  forcePathStyle: true,
});

const key = `blobs/_selftest/${randomBytes(8).toString('hex')}.bin`;
const payload = randomBytes(64 * 1024); // 64 KiB de "ciphertext"
let ok = true;
const step = (label: string, pass: boolean, extra = '') => {
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!pass) ok = false;
};

console.log(`\nBucket: ${BUCKET} @ ${ENDPOINT} (${REGION})\nKey de prueba: ${key}\n`);

try {
  // 1) Acceso al bucket (credenciales + permisos)
  await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  step('HeadBucket (acceso y credenciales)', true);

  // 2) Subida DIRECTA por URL prefirmada — exactamente lo que hace el cliente
  const putUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: BUCKET, Key: key, ContentLength: payload.length,
    ContentType: 'application/octet-stream',
  }), { expiresIn: 600 });
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.length) },
    body: payload,
  });
  step('PUT prefirmado (subida directa del cliente)', putRes.ok, `HTTP ${putRes.status}`);

  // 3) Descarga por URL prefirmada y verificación de integridad
  const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 600 });
  const getRes = await fetch(getUrl);
  const got = Buffer.from(await getRes.arrayBuffer());
  const intacto = got.length === payload.length && got.equals(payload);
  step('GET prefirmado + integridad (bytes idénticos)', getRes.ok && intacto, `${got.length} bytes`);

  // 4) Limpieza
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  step('DeleteObject (limpieza)', true);
} catch (err) {
  step('excepción', false, err instanceof Error ? err.message : String(err));
}

console.log(`\n${ok ? '✅ Bucket OK — lectura/escritura funcionan' : '❌ Hubo fallos arriba'}\n`);
process.exit(ok ? 0 : 1);
