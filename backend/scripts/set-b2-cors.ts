/**
 * Configura las reglas CORS del bucket B2 para permitir subida/descarga directa
 * desde el navegador (PUT/GET prefirmado desde noctcom.com).
 *   npx tsx --env-file=.env.prod scripts/set-b2-cors.ts
 */
import {
  S3Client, PutBucketCorsCommand, GetBucketCorsCommand,
} from '@aws-sdk/client-s3';

function need(n: string): string {
  const v = process.env[n];
  if (!v) { console.error(`✗ falta ${n}`); process.exit(1); }
  return v;
}

const BUCKET = need('S3_BUCKET');
const s3 = new S3Client({
  endpoint: need('S3_ENDPOINT'),
  region: need('S3_REGION'),
  credentials: { accessKeyId: need('S3_ACCESS_KEY'), secretAccessKey: need('S3_SECRET_KEY') },
  forcePathStyle: true,
});

const rules = [{
  AllowedOrigins: ['https://noctcom.com', 'https://www.noctcom.com', 'http://localhost:3001'],
  AllowedMethods: ['GET', 'PUT', 'HEAD'],
  AllowedHeaders: ['*'],
  ExposeHeaders: ['ETag', 'Content-Length'],
  MaxAgeSeconds: 3600,
}];

try {
  await s3.send(new PutBucketCorsCommand({ Bucket: BUCKET, CORSConfiguration: { CORSRules: rules } }));
  console.log('✓ Reglas CORS aplicadas a', BUCKET);
  const got = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.log('\nCORS actual:\n', JSON.stringify(got.CORSRules, null, 2));
} catch (e: any) {
  console.error(`✗ ${e.name}: ${e.message}`);
  console.error('  (si B2 no soporta PutBucketCors por S3, hay que ponerlo en el panel de Backblaze)');
  process.exit(1);
}
