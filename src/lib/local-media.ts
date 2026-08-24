import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const LOCAL_MEDIA_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/;

export function localMediaRoot(env: NodeJS.ProcessEnv = process.env) {
  return path.resolve(env.MEDIA_STORAGE_PATH || path.join(process.cwd(), 'media'));
}

export function resolveLocalMediaPath(filename: string, env: NodeJS.ProcessEnv = process.env) {
  if (!LOCAL_MEDIA_NAME.test(filename)) throw new Error('Invalid local media filename');
  const root = localMediaRoot(env);
  const resolved = path.resolve(root, filename);
  if (path.dirname(resolved) !== root) throw new Error('Local media path escaped its storage root');
  return resolved;
}

export function localMediaUrl(filename: string) {
  if (!LOCAL_MEDIA_NAME.test(filename)) throw new Error('Invalid local media filename');
  return `/api/media/${encodeURIComponent(filename)}`;
}

export function localMediaFilename(value: string) {
  let raw = value.startsWith('local-demo:') ? value.slice('local-demo:'.length) : value;
  if (raw.startsWith('/api/media/')) raw = decodeURIComponent(raw.slice('/api/media/'.length));
  if (!LOCAL_MEDIA_NAME.test(raw)) throw new Error('Invalid local media identifier');
  return raw;
}

export async function ensureLocalMediaRoot() {
  const root = localMediaRoot();
  await mkdir(root, { recursive: true });
  return root;
}

export async function openLocalMedia(value: string) {
  const filename = localMediaFilename(value);
  const filePath = resolveLocalMediaPath(filename);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile() || fileStat.size < 1024) throw new Error('Local media asset is missing or empty');
  return { filename, filePath, size: fileStat.size, stream: createReadStream(filePath) };
}
