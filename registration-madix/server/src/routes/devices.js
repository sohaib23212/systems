import express from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { httpError } from '../middleware/error.js';
import { liveDeviceStates, sendToDevice } from '../ws/hub.js';

export const devicesRouter = express.Router();
devicesRouter.use(authRequired);

function publicDevice(row, liveMap) {
  const live = liveMap.get(row.id);
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    platform: row.platform,
    osVersion: row.os_version,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
    online: !!live?.online,
    isRecording: live ? live.isRecording : row.is_recording,
    canLive: row.can_live,
  };
}

// Upsert a device by install id (stable per app installation).
devicesRouter.post('/register', async (req, res, next) => {
  try {
    const { installId, name, model, platform, osVersion, canLive } = req.body ?? {};
    if (typeof installId !== 'string' || installId.length < 8) {
      throw httpError(400, 'invalid_install_id');
    }
    const result = await query(
      `INSERT INTO devices (user_id, install_id, name, model, platform, os_version, can_live, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (user_id, install_id) DO UPDATE
         SET name = EXCLUDED.name,
             model = EXCLUDED.model,
             platform = EXCLUDED.platform,
             os_version = EXCLUDED.os_version,
             can_live = EXCLUDED.can_live,
             last_seen = now()
       RETURNING *`,
      [
        req.user.id,
        installId,
        (name ?? 'جهاز').toString().slice(0, 80),
        (model ?? '').toString().slice(0, 120),
        (platform ?? 'android').toString().slice(0, 20),
        (osVersion ?? '').toString().slice(0, 40),
        !!canLive,
      ],
    );
    const liveMap = new Map(liveDeviceStates(req.user.id).map((d) => [d.deviceId, d]));
    res.json({ device: publicDevice(result.rows[0], liveMap) });
  } catch (err) {
    next(err);
  }
});

devicesRouter.get('/', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM devices WHERE user_id = $1 ORDER BY last_seen DESC',
      [req.user.id],
    );
    const liveMap = new Map(liveDeviceStates(req.user.id).map((d) => [d.deviceId, d]));
    res.json({ devices: result.rows.map((r) => publicDevice(r, liveMap)) });
  } catch (err) {
    next(err);
  }
});

devicesRouter.patch('/:id', async (req, res, next) => {
  try {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) throw httpError(400, 'invalid_name');
    const result = await query(
      'UPDATE devices SET name = $3 WHERE user_id = $1 AND id = $2 RETURNING *',
      [req.user.id, req.params.id, name.trim().slice(0, 80)],
    );
    if (result.rowCount === 0) throw httpError(404, 'not_found');
    const liveMap = new Map(liveDeviceStates(req.user.id).map((d) => [d.deviceId, d]));
    res.json({ device: publicDevice(result.rows[0], liveMap) });
  } catch (err) {
    next(err);
  }
});

devicesRouter.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM devices WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
    ]);
    if (result.rowCount === 0) throw httpError(404, 'not_found');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Remote stop (REST convenience; the app normally uses the WebSocket command).
devicesRouter.post('/:id/stop', async (req, res, next) => {
  try {
    const r = await query('SELECT id FROM devices WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
    ]);
    if (r.rowCount === 0) throw httpError(404, 'not_found');
    const delivered = sendToDevice(req.user.id, req.params.id, {
      type: 'command',
      command: 'stop',
      from: 'rest',
    });
    res.json({ delivered });
  } catch (err) {
    next(err);
  }
});
