import { config } from '../config.js';

// Optional S3 driver. Requires @aws-sdk/client-s3 to be installed.
// Used only when STORAGE_DRIVER=s3. Default deployment uses the local driver.
let client = null;
let S3 = null;

async function ensureClient() {
  if (client) return client;
  try {
    S3 = await import('@aws-sdk/client-s3');
  } catch {
    throw new Error('STORAGE_DRIVER=s3 requires: npm install @aws-sdk/client-s3');
  }
  const { S3Client } = S3;
  client = new S3Client({
    endpoint: config.storage.s3.endpoint || undefined,
    region: config.storage.s3.region,
    forcePathStyle: config.storage.s3.forcePathStyle,
    credentials: config.storage.s3.accessKeyId
      ? {
          accessKeyId: config.storage.s3.accessKeyId,
          secretAccessKey: config.storage.s3.secretAccessKey,
        }
      : undefined,
  });
  return client;
}

const Bucket = config.storage.s3.bucket;

export const s3Driver = {
  async putStream(key, readable, { size } = {}) {
    await ensureClient();
    const { PutObjectCommand } = S3;
    await client.send(new PutObjectCommand({ Bucket, Key: key, Body: readable, ContentLength: size }));
    return { size: size ?? 0 };
  },

  async putBuffer(key, buffer) {
    await ensureClient();
    const { PutObjectCommand } = S3;
    await client.send(new PutObjectCommand({ Bucket, Key: key, Body: buffer }));
    return { size: buffer.length };
  },

  async stat(key) {
    await ensureClient();
    const { HeadObjectCommand } = S3;
    try {
      const r = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
      return { size: Number(r.ContentLength ?? 0) };
    } catch {
      return null;
    }
  },

  createReadStream(key, { start, end } = {}) {
    // Returns a promise-wrapped stream via an async generator passthrough.
    const { PassThrough } = require('node:stream');
    const pass = new PassThrough();
    (async () => {
      await ensureClient();
      const { GetObjectCommand } = S3;
      const Range = Number.isFinite(start)
        ? `bytes=${start}-${Number.isFinite(end) ? end : ''}`
        : undefined;
      const r = await client.send(new GetObjectCommand({ Bucket, Key: key, Range }));
      r.Body.pipe(pass);
    })().catch((e) => pass.destroy(e));
    return pass;
  },

  async delete(key) {
    await ensureClient();
    const { DeleteObjectCommand } = S3;
    await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
  },

  async deletePrefix(prefix) {
    await ensureClient();
    const { ListObjectsV2Command, DeleteObjectCommand } = S3;
    const list = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix }));
    for (const obj of list.Contents ?? []) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: obj.Key }));
    }
  },
};
