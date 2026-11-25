// The checks a change must pass before its pull request is opened: the same
// ones CI runs (.github/workflows/ci-quality.yml), for the packages the change
// touches. Run from the root of a working folder:
//
//   node scripts/agent-check.mjs            changes since origin/main
//   node scripts/agent-check.mjs --all      every package
//
// It installs what is missing first, the root tools included: without them
// `npx biome` downloads an unrelated package of the same name and checks
// nothing. It stops at the first failing check and says which.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');

function run(label, cwd, command) {
  console.log(`\n▶ ${label}\n  ${path.relative(root, cwd) || '.'}$ ${command}`);
  // A shell, so npm and npx start on Windows too (npm.cmd).
  const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(
      `\n✖ ${label} failed. Fix it before opening the pull request.`,
    );
    process.exit(result.status ?? 1);
  }
}

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

// What changed: committed since the branch left origin/main, plus what is not
// committed yet. Deleted files are left out (there is nothing to check).
const base = git(['merge-base', 'HEAD', 'origin/main']);
const changed = [
  ...new Set(
    [
      base ? git(['diff', '--name-only', '--diff-filter=d', base]) : '',
      git(['ls-files', '--others', '--exclude-standard']),
    ]
      .join('\n')
      .split('\n')
      .filter(Boolean),
  ),
].filter((file) => fs.existsSync(path.join(root, file)));

const touches = (folder) =>
  all || changed.some((file) => file.startsWith(`${folder}/`));
// The backend and the frontend build against circlesfera-shared's dist/.
const shared = touches('circlesfera-shared');
const backend = shared || touches('circlesfera-backend');
const frontend = shared || touches('circlesfera-frontend');
// The Help Desk is a product of its own (ADR-0034): it does not read shared.
const helpdesk = touches('circlesfera-helpdesk');

if (!all && changed.length === 0) {
  console.log('Nothing changed since origin/main.');
  process.exit(0);
}

const installed = (dir, pkg) =>
  fs.existsSync(path.join(dir, 'node_modules', ...pkg.split('/')));

// 1. The root tools, then Biome on the changed files, as CI does on all.
if (!installed(root, '@biomejs/biome')) {
  run('Install the root tools', root, 'npm ci --ignore-scripts');
}
const biomeFiles = all ? ['.'] : changed;
run(
  'Biome (format, lint, import order)',
  root,
  `npx biome ci --files-ignore-unknown=true --no-errors-on-unmatched ${biomeFiles
    .map((file) => JSON.stringify(file))
    .join(' ')}`,
);

const dir = (name) => path.join(root, name);

// 2. Shared: always built, since the other two read its dist/.
if (!installed(dir('circlesfera-shared'), 'typescript')) {
  run('Install shared', dir('circlesfera-shared'), 'npm ci');
}
run('Build shared', dir('circlesfera-shared'), 'npm run build');
if (shared) {
  run(
    'Shared module boundaries',
    dir('circlesfera-shared'),
    'npm run check:deps',
  );
}

// 3. Backend, as in CI.
if (backend) {
  const cwd = dir('circlesfera-backend');
  if (!installed(cwd, '@nestjs/core')) run('Install backend', cwd, 'npm ci');
  run('Generate the Prisma client', cwd, 'npx prisma generate');
  run('Build backend (types)', cwd, 'npm run build');
  run(
    'Types of backend scripts/',
    cwd,
    'npm run typecheck:scripts --if-present',
  );
  run('Lint backend', cwd, 'npm run lint');
  run('Backend module boundaries', cwd, 'npm run check:deps');
  run('Backend tests and coverage thresholds', cwd, 'npm run test:cov');
}

// 4. Frontend, as in CI.
if (frontend) {
  const cwd = dir('circlesfera-frontend');
  if (!installed(cwd, 'react')) run('Install frontend', cwd, 'npm ci');
  run('Lint frontend (and its own checks)', cwd, 'npm run lint');
  run('Frontend module boundaries', cwd, 'npm run check:deps');
  run('Frontend tests and coverage thresholds', cwd, 'npm run test:cov');
  run('Build frontend (types and bundle)', cwd, 'npm run build');
}

// 5. Help Desk, as in CI. Its drift check needs an empty Postgres:
//    HELPDESK_DATABASE_URL=... npm run prisma:check-migrations (CI runs it).
if (helpdesk) {
  const cwd = dir('circlesfera-helpdesk');
  if (!installed(cwd, '@nestjs/core')) run('Install Help Desk', cwd, 'npm ci');
  run('Generate the Help Desk Prisma client', cwd, 'npx prisma generate');
  run('Build Help Desk', cwd, 'npm run build');
  run('Types of the Help Desk and its tests', cwd, 'npm run typecheck');
  run('Lint Help Desk', cwd, 'npm run lint');
  run('Help Desk module boundaries', cwd, 'npm run check:deps');
  run('Help Desk tests and coverage thresholds', cwd, 'npm run test:cov');
}

console.log(
  `\n✔ Every check passed (${
    [
      shared && 'shared',
      backend && 'backend',
      frontend && 'frontend',
      helpdesk && 'helpdesk',
    ]
      .filter(Boolean)
      .join(', ') || 'formatting only'
  }).`,
);
console.log(
  'Not covered here: the Playwright checks (CI runs them) and a look at the\n' +
    'screens at 390×844 and 1280×800 when the change shows anything new.',
);
