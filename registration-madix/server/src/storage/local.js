import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';

const ROOT = config.storage.local.dir;

function safeResolve(key) {
  const resolved = path.resolve(ROOT, key);
  if (!resolved.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new Error('invalid storage key');
  }
  return resolved;
}

export const localDriver = {
  async putStream(key, readable) {
    const target = safeResolve(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.part`;
    await pipeline(readable, fs.createWriteStream(tmp));
    await fsp.rename(tmp, target);
    const st = await fsp.stat(target);
    return { size: st.size };
  },

  async putBuffer(key, buffer) {
    const target = safeResolve(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, buffer);
    return { size: buffer.length };
  },

  async stat(key) {
    try {
      const st = await fsp.stat(safeResolve(key));
      return { size: st.size };
    } catch {
      return null;
    }
  },

  // Returns a readable stream for the whole object or a byte range.
  createReadStream(key, { start, end } = {}) {
    const opts = {};
    if (Number.isFinite(start)) opts.start = start;
    if (Number.isFinite(end)) opts.end = end;
    return fs.createReadStream(safeResolve(key), opts);
  },

  async delete(key) {
    try {
      await fsp.rm(safeResolve(key), { force: true });
    } catch {
      /* ignore */
    }
  },

  async deletePrefix(prefix) {
    const dir = safeResolve(prefix);
    await fsp.rm(dir, { recursive: true, force: true });
  },
};
