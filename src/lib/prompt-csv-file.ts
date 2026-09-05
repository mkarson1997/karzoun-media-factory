import { join } from 'node:path';

const SAFE_CSV_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/i;

export function promptCsvPath(fileName: string, root = process.cwd()) {
  if (!SAFE_CSV_FILENAME.test(fileName)) {
    throw new Error('Prompt CSV must be a simple .csv filename without path separators');
  }
  return join(root, 'data', fileName);
}

export function promptCsvFilename(value: string | undefined, fallback: string) {
  const fileName = value?.trim() || fallback;
  if (!SAFE_CSV_FILENAME.test(fileName)) {
    throw new Error('Prompt CSV must be a simple .csv filename without path separators');
  }
  return fileName;
}
