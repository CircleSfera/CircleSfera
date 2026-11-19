// Runs Playwright from the folder it is started in (the root, or
// circlesfera-frontend), with the arguments given, on macOS, Linux and
// Windows alike: `npm run test:e2e -- --project=chromium`.
//
// Colours are off (FORCE_COLOR=0) and NO_COLOR is removed, as the scripts did
// with `env -u NO_COLOR FORCE_COLOR=0`, which needs a POSIX shell and fails on
// Windows, where npm runs scripts with cmd.exe.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const cli = require.resolve('@playwright/test/cli');

const env = { ...process.env, FORCE_COLOR: '0' };
delete env.NO_COLOR;

const run = spawnSync(
  process.execPath,
  [cli, 'test', ...process.argv.slice(2)],
  { stdio: 'inherit', env },
);
if (run.error) {
  console.error(`Playwright could not start: ${run.error.message}`);
  process.exit(1);
}
process.exit(run.status ?? 1);
