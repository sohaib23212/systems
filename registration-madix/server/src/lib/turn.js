import crypto from 'node:crypto';
import { config } from '../config.js';

// Build ICE servers for a client. When a coturn shared secret is configured,
// generate time-limited credentials (coturn "use-auth-secret" / TURN REST API).
export function buildIceServers() {
  const servers = [];
  for (const url of config.turn.stun) {
    servers.push({ urls: url });
  }
  if (config.turn.urls.length && config.turn.secret) {
    const unixTime = Math.floor(Date.now() / 1000) + config.turn.ttl;
    const username = `${unixTime}`;
    const hmac = crypto.createHmac('sha1', config.turn.secret);
    hmac.update(username);
    const credential = hmac.digest('base64');
    servers.push({
      urls: config.turn.urls,
      username,
      credential,
    });
  }
  return servers;
}
