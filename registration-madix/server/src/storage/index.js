import { config } from '../config.js';
import { localDriver } from './local.js';

let driver = localDriver;

if (config.storage.driver === 's3') {
  const { s3Driver } = await import('./s3.js');
  driver = s3Driver;
}

export const storage = driver;

// Key layout: <userId>/<recordingId>/video.mp4 and .../thumb.jpg
export function videoKey(userId, recordingId) {
  return `${userId}/${recordingId}/video.mp4`;
}

export function thumbKey(userId, recordingId) {
  return `${userId}/${recordingId}/thumb.jpg`;
}

export function recordingPrefix(userId, recordingId) {
  return `${userId}/${recordingId}`;
}
