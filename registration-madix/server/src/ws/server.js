import { WebSocketServer } from 'ws';
import { verifyAccessToken } from '../lib/jwt.js';
import { query } from '../db/pool.js';
import { buildIceServers } from '../lib/turn.js';
import {
  addConnection,
  bindDevice,
  removeConnection,
  getConn,
  sendToConn,
  sendToDevice,
  getDeviceConn,
  send,
  broadcastToUser,
  liveDeviceStates,
  addLiveSub,
  removeLiveSub,
  forwardLiveFrame,
  deviceHasViewers,
} from './hub.js';

function parseToken(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) return null;
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

async function touchDevice(userId, deviceId, isRecording) {
  await query(
    `UPDATE devices SET last_seen = now(), is_recording = $3 WHERE user_id = $1 AND id = $2`,
    [userId, deviceId, isRecording],
  );
}

export function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const payload = parseToken(req);
    if (!payload) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, payload);
    });
  });

  wss.on('connection', (ws, req, payload) => {
    const conn = addConnection(ws, { userId: payload.sub, username: payload.username });

    send(conn, { type: 'hello-ok', connId: conn.connId, iceServers: buildIceServers() });

    ws.on('message', async (raw, isBinary) => {
      // Binary payloads are live screen frames coming from a device.
      if (isBinary) {
        if (conn.role === 'device') {
          forwardLiveFrame(conn, raw);
        }
        return;
      }
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      try {
        await handleMessage(conn, msg);
      } catch (err) {
        console.error('[ws] handler error', err);
        send(conn, { type: 'error', message: 'server_error' });
      }
    });

    ws.on('pong', () => {
      conn.alive = true;
    });

    ws.on('close', () => {
      const wasRecordingDevice = conn.role === 'device' && conn.deviceId;
      removeConnection(conn);
      if (wasRecordingDevice) {
        touchDevice(conn.userId, conn.deviceId, false).catch(() => {});
        broadcastToUser(conn.userId, {
          type: 'device-update',
          device: { deviceId: conn.deviceId, online: false, isRecording: false },
        });
      }
    });
  });

  // Heartbeat: drop dead sockets.
  const interval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState !== client.OPEN) continue;
      // conn.alive is reset on pong; we can't map ws->conn cheaply here,
      // so just ping. Stale sockets are cleaned on 'close'.
      try {
        client.ping();
      } catch {
        /* ignore */
      }
    }
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  return wss;
}

async function handleMessage(conn, msg) {
  switch (msg.type) {
    case 'hello': {
      // Device identifies itself. deviceId must belong to the user.
      if (msg.role === 'device' && msg.deviceId) {
        const r = await query('SELECT id FROM devices WHERE user_id = $1 AND id = $2', [
          conn.userId,
          msg.deviceId,
        ]);
        if (r.rowCount === 0) {
          send(conn, { type: 'error', message: 'unknown_device' });
          return;
        }
        bindDevice(conn, msg.deviceId);
        conn.canLive = !!msg.canLive;
        await touchDevice(conn.userId, conn.deviceId, false);
        broadcastToUser(conn.userId, {
          type: 'device-update',
          device: { deviceId: conn.deviceId, online: true, isRecording: false, canLive: conn.canLive },
        }, conn);
      }
      return;
    }

    case 'presence': {
      if (conn.role !== 'device' || !conn.deviceId) return;
      conn.isRecording = !!msg.isRecording;
      await touchDevice(conn.userId, conn.deviceId, conn.isRecording);
      broadcastToUser(conn.userId, {
        type: 'device-update',
        device: {
          deviceId: conn.deviceId,
          online: true,
          isRecording: conn.isRecording,
          canLive: conn.canLive,
        },
      }, conn);
      return;
    }

    case 'devices': {
      // Viewer asks for current live device states.
      send(conn, { type: 'devices', devices: liveDeviceStates(conn.userId) });
      return;
    }

    case 'command': {
      // Viewer -> device remote control (e.g. stop recording).
      if (!msg.deviceId || !msg.command) return;
      const delivered = sendToDevice(conn.userId, msg.deviceId, {
        type: 'command',
        command: msg.command,
        from: conn.connId,
      });
      send(conn, { type: 'command-ack', deviceId: msg.deviceId, delivered });
      return;
    }

    case 'live-request': {
      // Viewer wants to watch a device's screen live (frame stream).
      if (!msg.deviceId) return;
      const device = addLiveSub(conn.userId, msg.deviceId, conn);
      if (!device) {
        send(conn, { type: 'live-error', deviceId: msg.deviceId, reason: 'offline' });
        return;
      }
      conn.watching = msg.deviceId;
      // Ask the device to begin streaming (quality hints optional).
      send(device, {
        type: 'live-start',
        fps: Number.isFinite(msg.fps) ? msg.fps : undefined,
        maxWidth: Number.isFinite(msg.maxWidth) ? msg.maxWidth : undefined,
      });
      send(conn, { type: 'live-ready', deviceId: msg.deviceId });
      return;
    }

    case 'live-stop': {
      // Viewer stops watching.
      const deviceId = msg.deviceId ?? conn.watching;
      if (deviceId) {
        removeLiveSub(conn.userId, deviceId, conn);
        conn.watching = null;
      }
      return;
    }

    case 'signal': {
      // WebRTC signaling relay (sdp / ice), routed by connId within the user.
      if (!msg.to || msg.data === undefined) return;
      const target = getConn(msg.to);
      if (!target || target.userId !== conn.userId) return;
      send(target, { type: 'signal', from: conn.connId, data: msg.data });
      return;
    }

    case 'ping': {
      send(conn, { type: 'pong', t: Date.now() });
      return;
    }

    default:
      return;
  }
}
