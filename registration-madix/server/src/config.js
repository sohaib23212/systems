import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === null || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function int(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer`);
  return n;
}

function bool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

const dev = (process.env.NODE_ENV ?? 'development') !== 'production';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  dev,
  port: int('PORT', 8080),
  host: process.env.HOST ?? '0.0.0.0',
  publicUrl: process.env.PUBLIC_URL ?? '',

  database: {
    url: required('DATABASE_URL', dev ? 'postgres://madix:madix@localhost:5432/madix' : undefined),
    ssl: bool('DATABASE_SSL', false),
    poolMax: int('DATABASE_POOL_MAX', 10),
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', dev ? 'dev-access-secret-change-me' : undefined),
    refreshSecret: required('JWT_REFRESH_SECRET', dev ? 'dev-refresh-secret-change-me' : undefined),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '30m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '60d',
  },

  storage: {
    driver: process.env.STORAGE_DRIVER ?? 'local', // 'local' | 's3'
    local: {
      dir: process.env.STORAGE_LOCAL_DIR ?? path.join(__dirname, '..', 'data', 'recordings'),
    },
    s3: {
      endpoint: process.env.S3_ENDPOINT ?? '',
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET ?? '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      forcePathStyle: bool('S3_FORCE_PATH_STYLE', true),
    },
    maxUploadBytes: int('MAX_UPLOAD_BYTES', 4 * 1024 * 1024 * 1024), // 4 GB
  },

  limits: {
    maxUsernameLen: 40,
    minUsernameLen: 3,
    minPasswordLen: 6,
  },

  turn: {
    // Shared TURN secret used for time-limited credentials (coturn use-auth-secret).
    urls: (process.env.TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    secret: process.env.TURN_SECRET ?? '',
    ttl: int('TURN_TTL', 3600),
    stun: (process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302')
      .split(',').map((s) => s.trim()).filter(Boolean),
  },
};
