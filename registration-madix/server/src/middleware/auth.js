import { verifyAccessToken } from '../lib/jwt.js';

export function authRequired(req, res, next) {
  const header = req.headers.authorization ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'missing_token' });
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, username: payload.username };
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}
