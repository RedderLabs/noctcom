import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';
import { env } from '../config.js';

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true,    // necesario para MinIO
});

export async function initS3(): Promise<void> {
  await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
}

/** Devuelve una URL con la que el cliente sube DIRECTAMENTE el ciphertext a MinIO.
 *  El backend nunca toca el blob → ahorra ancho de banda y elimina copia intermedia. */
export async function presignUpload(
  s3Key: string,
  contentLength: number,
  expiresInSec = 600,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: s3Key,
    ContentLength: contentLength,
    ContentType: 'application/octet-stream',
  });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSec });
}

export async function presignDownload(
  s3Key: string,
  expiresInSec = 600,
): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: s3Key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSec });
}

export async function deleteBlob(s3Key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: s3Key }));
}

/** Genera una key opaca aleatoria — no debe revelar nada sobre el archivo */
export function generateS3Key(): string {
  return `blobs/${randomBytes(2).toString('hex')}/${randomBytes(16).toString('hex')}`;
}
