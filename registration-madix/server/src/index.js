import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { authRouter } from './routes/auth.js';
import { devicesRouter } from './routes/devices.js';
import { recordingsRouter } from './routes/recordings.js';
import { authRequired } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/error.js';
import { buildIceServers } from './lib/turn.js';
import { attachWebSocket } from './ws/server.js';

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/ice', authRequired, (req, res) => {
  res.json({ iceServers: buildIceServers() });
});

app.use('/api/auth', authRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/recordings', recordingsRouter);

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
server.requestTimeout = 0; // allow long uploads
server.headersTimeout = 65000;
attachWebSocket(server);

async function start() {
  try {
    await migrate();
  } catch (err) {
    console.error('[startup] migration failed; retrying in 3s', err.message);
    await new Promise((r) => setTimeout(r, 3000));
    await migrate();
  }
  server.listen(config.port, config.host, () => {
    console.log(`[server] listening on http://${config.host}:${config.port} (${config.env})`);
  });
}

function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
