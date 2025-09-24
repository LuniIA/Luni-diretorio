import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

function getEnv(name, required = true) {
  const v = process.env[name];
  if (required && !v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const provider = getEnv('BACKUP_PROVIDER');
  if (provider !== 'b2') throw new Error(`Unsupported BACKUP_PROVIDER=${provider}`);

  const S3_ENDPOINT = getEnv('S3_ENDPOINT');
  const S3_BUCKET = getEnv('S3_BUCKET');
  const S3_ACCESS_KEY = getEnv('S3_ACCESS_KEY');
  const S3_SECRET_KEY = getEnv('S3_SECRET_KEY');
  const S3_REGION = process.env.S3_REGION || 'auto';

  const client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY }
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = process.env.BACKUP_PREFIX || 'luni-backup';
  const name = `${prefix}/${stamp}.txt`;

  // Minimal: subir um arquivo indicador de backup (podemos evoluir para zip)
  const contents = `Luni backup marker\nHost: ${os.hostname()}\nDate: ${new Date().toISOString()}\n`;

  await client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: name,
    Body: contents,
    ContentType: 'text/plain'
  }));

  console.log(JSON.stringify({ ok: true, bucket: S3_BUCKET, key: name }));
}

main().catch((e) => {
  console.error('Backup failed:', e.message);
  process.exit(1);
});


