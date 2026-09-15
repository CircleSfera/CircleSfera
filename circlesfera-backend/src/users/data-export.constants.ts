import * as path from 'node:path';

export const EXPORTS_DIR = path.join(process.cwd(), 'storage', 'exports');
export const LEGACY_EXPORTS_DIR = path.join(
  process.cwd(),
  'uploads',
  'exports',
);
export const DATA_EXPORT_EXPIRY_DAYS = 7;
export const DATA_EXPORT_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
