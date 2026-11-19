// Applies the migrations to the database of the root Playwright journeys
// (docker-compose.e2e.yml, port 5433), or to E2E_DATABASE_URL when it is set,
// on macOS, Linux and Windows alike. It replaces a script that set
// DATABASE_URL with `VAR=value command`, which needs a POSIX shell.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'circlesfera-backend',
);
const require = createRequire(path.join(backend, 'package.json'));
const prisma = path.join(
  path.dirname(require.resolve('prisma/package.json')),
  'build',
  'index.js',
);

const run = spawnSync(process.execPath, [prisma, 'migrate', 'deploy'], {
  cwd: backend,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL:
      process.env.E2E_DATABASE_URL ||
      'postgresql://prisma:prisma@localhost:5433/circlesfera_e2e?schema=public',
  },
});
if (run.error) {
  console.error(`Prisma could not start: ${run.error.message}`);
  process.exit(1);
}
process.exit(run.status ?? 1);
