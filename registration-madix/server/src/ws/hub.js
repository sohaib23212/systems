import crypto from 'node:crypto';

// In-memory connection registry. Single-process (one VPS) design.
// For horizontal scaling, back this with Redis pub/sub.

const byConnId = new Map();        // connId -> conn
const byUser = new Map();          // userId -> Set<conn>
const deviceConn = new Map();      // `${userId}:${deviceId}` -> conn (latest device socket)
// Live view: which viewer connections are watching a given device connection.
const liveSubs = new Map();        // deviceConnId -> Set<viewerConn>

function deviceKey(userId, deviceId) {
  return `${userId}:${deviceId}`;
}

export function addConnection(ws, { userId, username }) {
  const connId = crypto.randomUUID();
  const conn = {
    connId,
    ws,
    userId,
    username,
    role: 'viewer',
    deviceId: null,
    isRecording: false,
    alive: true,
  };
  byConnId.set(connId, conn);
  if (!byUser.has(userId)) byUser.set(userId, new Set());
  byUser.get(userId).add(conn);
  return conn;
}

export function bindDevice(conn, deviceId) {
  conn.role = 'device';
  conn.deviceId = deviceId;
  deviceConn.set(deviceKey(conn.userId, deviceId), conn);
}

export function removeConnection(conn) {
  if (!conn) return;
  byConnId.delete(conn.connId);
  const set = byUser.get(conn.userId);
  if (set) {
    set.delete(conn);
    if (set.size === 0) byUser.delete(conn.userId);
  }
  if (conn.role === 'device' && conn.deviceId) {
    const key = deviceKey(conn.userId, conn.deviceId);
    if (deviceConn.get(key) === conn) deviceConn.delete(key);
  }
  // Tear down any live subscriptions involving this connection.
  if (liveSubs.has(conn.connId)) {
    // This was a device being watched: tell viewers it ended.
    for (const viewer of liveSubs.get(conn.connId)) {
      send(viewer, { type: 'live-ended', deviceId: conn.deviceId });
    }
    liveSubs.delete(conn.connId);
  }
  // This may be a viewer watching some devices: remove it everywhere.
  for (const [deviceConnId, viewers] of liveSubs) {
    if (viewers.delete(conn) && viewers.size === 0) {
      liveSubs.delete(deviceConnId);
      const dev = byConnId.get(deviceConnId);
      if (dev) send(dev, { type: 'live-stop' });
    }
  }
}

// Viewer subscribes to a device's live frames. Returns the device conn or null.
export function addLiveSub(userId, deviceId, viewerConn) {
  const dev = getDeviceConn(userId, deviceId);
  if (!dev) return null;
  if (!liveSubs.has(dev.connId)) liveSubs.set(dev.connId, new Set());
  liveSubs.get(dev.connId).add(viewerConn);
  return dev;
}

export function removeLiveSub(userId, deviceId, viewerConn) {
  const dev = getDeviceConn(userId, deviceId);
  if (!dev) return;
  const viewers = liveSubs.get(dev.connId);
  if (!viewers) return;
  viewers.delete(viewerConn);
  if (viewers.size === 0) {
    liveSubs.delete(dev.connId);
    send(dev, { type: 'live-stop' });
  }
}

// Forward a binary frame from a device to all its live viewers. Returns count.
export function forwardLiveFrame(deviceConn, frame) {
  const viewers = liveSubs.get(deviceConn.connId);
  if (!viewers || viewers.size === 0) return 0;
  let n = 0;
  for (const viewer of viewers) {
    if (viewer.ws.readyState === viewer.ws.OPEN) {
      try {
        viewer.ws.send(frame, { binary: true });
        n++;
      } catch {
        /* ignore */
      }
    }
  }
  return n;
}

export function deviceHasViewers(deviceConn) {
  const viewers = liveSubs.get(deviceConn.connId);
  return !!viewers && viewers.size > 0;
}

export function getConn(connId) {
  return byConnId.get(connId) ?? null;
}

export function getDeviceConn(userId, deviceId) {
  return deviceConn.get(deviceKey(userId, deviceId)) ?? null;
}

export function send(conn, obj) {
  if (!conn || conn.ws.readyState !== conn.ws.OPEN) return false;
  try {
    conn.ws.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

// Send to a specific connection id, only within the same user (isolation).
export function sendToConn(userId, connId, obj) {
  const conn = byConnId.get(connId);
  if (!conn || conn.userId !== userId) return false;
  return send(conn, obj);
}

export function sendToDevice(userId, deviceId, obj) {
  const conn = getDeviceConn(userId, deviceId);
  if (!conn) return false;
  return send(conn, obj);
}

// Broadcast to every connection of a user (optionally excluding one).
export function broadcastToUser(userId, obj, exceptConn = null) {
  const set = byUser.get(userId);
  if (!set) return;
  for (const conn of set) {
    if (conn === exceptConn) continue;
    send(conn, obj);
  }
}

// Live recording state per user, for viewers.
export function liveDeviceStates(userId) {
  const set = byUser.get(userId);
  const states = [];
  if (!set) return states;
  for (const conn of set) {
    if (conn.role === 'device' && conn.deviceId) {
      states.push({
        deviceId: conn.deviceId,
        connId: conn.connId,
        isRecording: conn.isRecording,
        online: true,
      });
    }
  }
  return states;
}
