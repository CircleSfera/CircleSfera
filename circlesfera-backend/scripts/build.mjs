// Compiles the backend into dist/ with TypeScript 7 and copies the files the
// code reads at run time. A type error stops the build.
//
// The API documentation's metadata is written in the source, as decorators
// on each DTO property and route (@ApiProperty, @ApiResponse, @ApiQuery,
// @ApiParam); nothing adds it at build time.
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

// Files read from disk next to the compiled code, relative to src/.
const ASSETS = ['auth/leaked-passwords/leaked-passwords.txt'];

rmSync(dist, { recursive: true, force: true });
const tsc = spawnSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['-p', path.join(root, 'tsconfig.build.json')],
  { stdio: 'inherit' },
);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

for (const asset of ASSETS) {
  cpSync(path.join(root, 'src', asset), path.join(dist, asset));
}
