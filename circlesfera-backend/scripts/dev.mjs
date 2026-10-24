// Builds the backend (scripts/build.mjs) and runs it. `npm run start:dev`
// runs this under `node --watch-path=src`, which builds and starts it again
// on every change to the source.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/build.mjs')],
  { stdio: 'inherit', cwd: root },
);
if (build.status === 0) {
  await import(pathToFileURL(path.join(root, 'dist/main.js')).href);
} else {
  console.error('The build failed; it runs again on the next change.');
  process.exitCode = 1;
}
