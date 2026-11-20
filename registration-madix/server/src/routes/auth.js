import express from 'express';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  signAccessToken,
  newRefreshToken,
  hashRefreshToken,
} from '../lib/jwt.js';
import { httpError } from '../middleware/error.js';
import { authRequired } from '../middleware/auth.js';

export const authRouter = express.Router();

function validateCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw httpError(400, 'invalid_input', 'username and password are required');
  }
  const u = username.trim();
  if (u.length < config.limits.minUsernameLen || u.length > config.limits.maxUsernameLen) {
    throw httpError(400, 'invalid_username', 'username length out of range');
  }
  if (!/^[A-Za-z0-9._\-؀-ۿ]+$/.test(u)) {
    throw httpError(400, 'invalid_username', 'username has invalid characters');
  }
  if (password.length < config.limits.minPasswordLen) {
    throw httpError(400, 'invalid_password', 'password too short');
  }
  return u;
}

async function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = newRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expires],
  );
  return { accessToken, refreshToken };
}

function publicUser(row) {
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    const u = validateCredentials(username, password);
    const existing = await query('SELECT 1 FROM users WHERE username_ci = $1', [u.toLowerCase()]);
    if (existing.rowCount > 0) {
      throw httpError(409, 'username_taken', 'username already exists');
    }
    const passwordHash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (username, username_ci, password_hash)
       VALUES ($1, $2, $3) RETURNING id, username, created_at`,
      [u, u.toLowerCase(), passwordHash],
    );
    const user = result.rows[0];
    const tokens = await issueTokens(user);
    res.status(201).json({ user: publicUser(user), ...tokens });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw httpError(400, 'invalid_input');
    }
    const result = await query(
      'SELECT id, username, password_hash, created_at FROM users WHERE username_ci = $1',
      [username.trim().toLowerCase()],
    );
    const row = result.rows[0];
    if (!row) throw httpError(401, 'invalid_credentials');
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) throw httpError(401, 'invalid_credentials');
    const tokens = await issueTokens(row);
    res.json({ user: publicUser(row), ...tokens });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== 'string') throw httpError(400, 'invalid_input');
    const tokenHash = hashRefreshToken(refreshToken);
    const result = await query(
      `SELECT rt.id, rt.expires_at, rt.revoked, u.id AS user_id, u.username, u.created_at
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row || row.revoked || new Date(row.expires_at) < new Date()) {
      throw httpError(401, 'invalid_refresh');
    }
    // Rotate: revoke old, issue new.
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id]);
    const user = { id: row.user_id, username: row.username, created_at: row.created_at };
    const tokens = await issueTokens(user);
    res.json({ user: publicUser(user), ...tokens });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken === 'string') {
      await query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [
        hashRefreshToken(refreshToken),
      ]);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authRequired, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, username, created_at FROM users WHERE id = $1',
      [req.user.id],
    );
    if (result.rowCount === 0) throw httpError(404, 'not_found');
    res.json({ user: publicUser(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});
