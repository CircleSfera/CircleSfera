#!/usr/bin/env node

/**
 * CircleSfera runtime dependency check
 *
 * The backend production image installs without dev dependencies. A package
 * that production code imports must therefore be part of that install; if it
 * is only there as a dev dependency, the image build or the running backend
 * fails with "Cannot find module" even though every test passes (tests
 * install everything).
 *
 * Checks every import in the code the image runs (`src/` without tests and
 * test helpers, and `prisma.config.ts`) against the lockfile: the package
 * must be at the top of `node_modules` and not marked as dev only. Type-only
 * imports are ignored because they are erased at build time.
 *
 * Usage:
 *   node scripts/check-runtime-dependencies.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, resolve } from 'node:path';

const BACKEND = resolve(process.cwd(), 'circlesfera-backend');
const TEST_FILE = /\.(spec|test|e2e-spec)\.ts$|\/(testing|test|__mocks__)\//;
const IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^'"\n;]*?\sfrom\s+)?['"]([^'"]+)['"]|(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;

const lock = JSON.parse(
  readFileSync(join(BACKEND, 'package-lock.json'), 'utf8'),
);

// In a production install: at the top of node_modules and not dev only.
function installedInProduction(name) {
  const entry = lock.packages[`node_modules/${name}`];
  return Boolean(entry) && !entry.dev && !entry.devOptional;
}
const builtins = new Set(builtinModules);

function packageName(specifier) {
  if (/^(\.|\/|#|node:)/.test(specifier)) return null;
  const [first, second] = specifier.split('/');
  const name = first.startsWith('@') ? `${first}/${second}` : first;
  return builtins.has(name) ? null : name;
}

const files = execFileSync('git', ['ls-files', 'src', 'prisma.config.ts'], {
  cwd: BACKEND,
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => /\.(ts|js|mjs)$/.test(file) && !TEST_FILE.test(file));

const missing = new Map();
for (const file of files) {
  const source = readFileSync(join(BACKEND, file), 'utf8');
  for (const match of source.matchAll(IMPORT)) {
    const name = packageName(match[1] ?? match[2]);
    if (name && !installedInProduction(name)) {
      if (!missing.has(name)) missing.set(name, []);
      missing.get(name).push(file);
    }
  }
}

if (missing.size > 0) {
  console.error(
    '❌ Production code imports packages that the production install does not include:',
  );
  for (const [name, users] of missing) {
    console.error(`   - ${name}, imported by ${users[0]}`);
    if (users.length > 1) console.error(`     and ${users.length - 1} more`);
  }
  console.error(
    '   List them under "dependencies" in circlesfera-backend/package.json.',
  );
  process.exit(1);
}
console.log(
  `✅ ${files.length} backend production files import only packages of the production install.`,
);
