import express from 'express';
import { Transform } from 'node:stream';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { authRequired } from '../middleware/auth.js';
import { httpError } from '../middleware/error.js';
import {
  storage,
  videoKey,
  thumbKey,
  recordingPrefix,
} from '../storage/index.js';

export const recordingsRouter = express.Router();
recordingsRouter.use(authRequired);

function publicRecording(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    deviceName: row.device_name,
    title: row.title,
    mime: row.mime,
    sizeBytes: Number(row.size_bytes),
    durationMs: Number(row.duration_ms),
    width: row.width,
    height: row.height,
    hasAudio: row.has_audio,
    encrypted: row.encrypted,
    status: row.status,
    hasThumb: !!row.thumb_key,
    createdAt: row.created_at,
  };
}

// 1) Create metadata row -> returns id to upload against.
recordingsRouter.post('/', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const result = await query(
      `INSERT INTO recordings
         (user_id, device_id, device_name, title, mime, duration_ms, width, height, has_audio, encrypted, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
       RETURNING *`,
      [
        req.user.id,
        b.deviceId ?? null,
        (b.deviceName ?? '').toString().slice(0, 80),
        (b.title ?? '').toString().slice(0, 200),
        (b.mime ?? 'video/mp4').toString().slice(0, 40),
        Number.isFinite(b.durationMs) ? Math.trunc(b.durationMs) : 0,
        Number.isFinite(b.width) ? Math.trunc(b.width) : 0,
        Number.isFinite(b.height) ? Math.trunc(b.height) : 0,
        !!b.hasAudio,
        !!b.encrypted,
      ],
    );
    res.status(201).json({ recording: publicRecording(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// 2) Upload the video bytes (raw stream). Content-Type: application/octet-stream.
recordingsRouter.put('/:id/video', async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM recordings WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
    ]);
    if (r.rowCount === 0) throw httpError(404, 'not_found');

    const key = videoKey(req.user.id, req.params.id);
    await query('UPDATE recordings SET status = $3 WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
      'uploading',
    ]);

    const declared = Number(req.headers['content-length'] ?? 0);
    const max = config.storage.maxUploadBytes;
    if (declared > max) {
      throw httpError(413, 'too_large');
    }

    // Count bytes as they flow through, without consuming the stream early.
    let received = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length;
        if (received > max) {
          cb(Object.assign(new Error('too_large'), { status: 413, code: 'too_large' }));
          return;
        }
        cb(null, chunk);
      },
    });
    req.pipe(counter);

    const { size } = await storage.putStream(key, counter, { size: declared || undefined });

    const updated = await query(
      `UPDATE recordings SET storage_key = $3, size_bytes = $4, status = 'ready', updated_at = now()
       WHERE user_id = $1 AND id = $2 RETURNING *`,
      [req.user.id, req.params.id, key, size],
    );
    res.json({ recording: publicRecording(updated.rows[0]) });
  } catch (err) {
    await query(`UPDATE recordings SET status = 'failed' WHERE user_id = $1 AND id = $2`, [
      req.user.id,
      req.params.id,
    ]).catch(() => {});
    next(err);
  }
});

// 3) Upload thumbnail (raw jpeg/png stream).
recordingsRouter.put('/:id/thumbnail', async (req, res, next) => {
  try {
    const r = await query('SELECT id FROM recordings WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
    ]);
    if (r.rowCount === 0) throw httpError(404, 'not_found');
    const key = thumbKey(req.user.id, req.params.id);
    await storage.putStream(key, req);
    await query('UPDATE recordings SET thumb_key = $3 WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
      key,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 4) List recordings (paginated).
recordingsRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const before = req.query.before ? new Date(req.query.before) : null;
    const params = [req.user.id, limit];
    let sql =
      'SELECT * FROM recordings WHERE user_id = $1';
    if (before && !Number.isNaN(before.getTime())) {
      sql += ' AND created_at < $3';
      params.push(before);
    }
    sql += ' ORDER BY created_at DESC LIMIT $2';
    const result = await query(sql, params);
    res.json({ recordings: result.rows.map(publicRecording) });
  } catch (err) {
    next(err);
  }
});

// 5) One recording's metadata.
recordingsRouter.get('/:id', async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM recordings WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
    ]);
    if (r.rowCount === 0) throw httpError(404, 'not_found');
    res.json({ recording: publicRecording(r.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// 6) Stream the video with HTTP range support (seeking).
recordingsRouter.get('/:id/video', async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM recordings WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
    ]);
    const row = r.rows[0];
    if (!row || !row.storage_key) throw httpError(404, 'not_found');
    const stat = await storage.stat(row.storage_key);
    if (!stat) throw httpError(404, 'not_found');

    const total = stat.size;
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', row.mime || 'video/mp4');

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', end - start + 1);
      storage.createReadStream(row.storage_key, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', total);
      storage.createReadStream(row.storage_key).pipe(res);
    }
  } catch (err) {
    next(err);
  }
});

// 7) Stream the thumbnail.
recordingsRouter.get('/:id/thumbnail', async (req, res, next) => {
  try {
    const r = await query('SELECT thumb_key FROM recordings WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
    ]);
    const row = r.rows[0];
    if (!row || !row.thumb_key) throw httpError(404, 'not_found');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    storage.createReadStream(row.thumb_key).pipe(res);
  } catch (err) {
    next(err);
  }
});

// 8) Rename.
recordingsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { title } = req.body ?? {};
    if (typeof title !== 'string') throw httpError(400, 'invalid_title');
    const result = await query(
      'UPDATE recordings SET title = $3, updated_at = now() WHERE user_id = $1 AND id = $2 RETURNING *',
      [req.user.id, req.params.id, title.slice(0, 200)],
    );
    if (result.rowCount === 0) throw httpError(404, 'not_found');
    res.json({ recording: publicRecording(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// 9) Delete metadata + stored files.
recordingsRouter.delete('/:id', async (req, res, next) => {
  try {
    const r = await query('SELECT id FROM recordings WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
    ]);
    if (r.rowCount === 0) throw httpError(404, 'not_found');
    await storage.deletePrefix(recordingPrefix(req.user.id, req.params.id)).catch(() => {});
    await query('DELETE FROM recordings WHERE user_id = $1 AND id = $2', [
      req.user.id,
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
