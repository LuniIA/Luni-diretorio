import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import archiver from 'archiver';
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

  // 1) Marker (saúde)
  const markerKey = `${prefix}/${stamp}.txt`;
  const marker = `Luni backup marker\nHost: ${os.hostname()}\nDate: ${new Date().toISOString()}\n`;
  await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: markerKey, Body: marker, ContentType: 'text/plain' }));

  // 2) ZIP completo (historico/, focos/, variaveis/, logs/ se existirem)
  const zipKey = `${prefix}/${stamp}.zip`;
  const tmpZip = path.join(os.tmpdir(), `luni-backup-${stamp}.zip`);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(tmpZip);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    const addIfExists = (dir) => {
      if (fs.existsSync(dir)) archive.directory(dir, path.basename(dir));
    };
    addIfExists('historico');
    addIfExists('focos');
    addIfExists('variaveis');
    addIfExists('logs');
    archive.finalize();
  });
  const zipBody = fs.createReadStream(tmpZip);
  await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: zipKey, Body: zipBody, ContentType: 'application/zip' }));

  console.log(JSON.stringify({ ok: true, bucket: S3_BUCKET, marker: markerKey, zip: zipKey }));
}

main().catch((e) => {
  console.error('Backup failed:', e.message);
  process.exit(1);
});


