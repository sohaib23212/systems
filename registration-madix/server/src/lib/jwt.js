import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, typ: 'access' },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtl },
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, config.jwt.accessSecret);
  if (payload.typ !== 'access') throw new Error('wrong token type');
  return payload;
}

// Refresh tokens are opaque random strings; only their hash is stored.
export function newRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
