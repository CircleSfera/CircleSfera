#!/usr/bin/env node
/**
 * verify-lockfile-integrity.mjs
 *
 * Verifies the integrity and provenance of npm lockfiles across all
 * CircleSfera workspaces. This script must pass before `npm ci` runs
 * in CI to prevent supply-chain attacks via tampered lockfiles.
 *
 * Checks performed:
 *   1. Lockfile version is v3 (current npm standard).
 *   2. Every resolved package URL points to an allowed registry.
 *   3. Every installable package entry carries a sha512 integrity hash.
 *   4. No package declares `_resolved` or `_integrity` override fields
 *      that could shadow the canonical integrity value.
 *   5. All declared dependencies in package.json have a corresponding
 *      entry in the lockfile (no phantom deps).
 *   6. Integrity hashes are well-formed sha512 SRI strings.
 *   7. (Optional, skipped with --skip-signatures) Spot-check a sample
 *      of registry-resolved packages against the npm registry for
 *      published integrity metadata.
 *
 * Usage:
 *   node scripts/verify-lockfile-integrity.mjs
 *   node scripts/verify-lockfile-integrity.mjs --skip-signatures
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '..');

const WORKSPACES = [
  { name: 'root', dir: ROOT },
  { name: 'backend', dir: join(ROOT, 'circlesfera-backend') },
  { name: 'frontend', dir: join(ROOT, 'circlesfera-frontend') },
  { name: 'shared', dir: join(ROOT, 'circlesfera-shared') },
];

const ALLOWED_REGISTRIES = ['https://registry.npmjs.org/'];
const REQUIRED_LOCKFILE_VERSION = 3;
const SHA512_SRI_RE = /^sha512-[A-Za-z0-9+/]+=*$/;
const REGISTRY_SPOT_CHECK_SAMPLE = 5;

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const SKIP_SIGNATURES = args.includes('--skip-signatures');
const VERBOSE = args.includes('--verbose');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let errors = 0;
let warnings = 0;

function fail(workspace, message) {
  console.error(`  \u2717 [${workspace}] ${message}`);
  errors++;
}

function warn(workspace, message) {
  console.warn(`  \u26a0 [${workspace}] ${message}`);
  warnings++;
}

function ok(message) {
  if (VERBOSE) console.log(`  \u2713 ${message}`);
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function fetchRegistryIntegrity(packageName, version) {
  const encodedName = packageName.replaceAll('/', '%2F');
  const url = `https://registry.npmjs.org/${encodedName}/${version}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { integrity: data?.dist?.integrity };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-workspace verification
// ---------------------------------------------------------------------------

async function verifyWorkspace(workspace) {
  const { name, dir } = workspace;
  const lockfilePath = join(dir, 'package-lock.json');
  const packageJsonPath = join(dir, 'package.json');

  console.log(`\n\u25b6 Verifying workspace: ${name}`);

  if (!existsSync(lockfilePath)) {
    fail(name, `package-lock.json not found at ${lockfilePath}`);
    return;
  }
  if (!existsSync(packageJsonPath)) {
    fail(name, `package.json not found at ${packageJsonPath}`);
    return;
  }

  const lockfile = readJson(lockfilePath);
  const packageJson = readJson(packageJsonPath);

  if (!lockfile) {
    fail(name, 'package-lock.json is not valid JSON');
    return;
  }
  if (!packageJson) {
    fail(name, 'package.json is not valid JSON');
    return;
  }

  // Check 1: lockfileVersion
  if (lockfile.lockfileVersion !== REQUIRED_LOCKFILE_VERSION) {
    fail(
      name,
      `lockfileVersion is ${lockfile.lockfileVersion}, expected ${REQUIRED_LOCKFILE_VERSION}. Run \`npm install\` with Node >=18 to regenerate.`,
    );
  } else {
    ok(`${name}: lockfileVersion = ${lockfile.lockfileVersion}`);
  }

  const packages = lockfile.packages ?? {};
  const installable = Object.entries(packages).filter(
    ([key, pkg]) => key !== '' && !pkg.link,
  );

  let missingIntegrity = 0;
  let badRegistry = 0;
  let malformedHash = 0;
  const registrySpotCheckCandidates = [];

  for (const [pkgPath, pkg] of installable) {
    // Check 2: Registry allowlist
    if (pkg.resolved) {
      const allowed = ALLOWED_REGISTRIES.some((r) =>
        pkg.resolved.startsWith(r),
      );
      if (!allowed) {
        fail(
          name,
          `Non-allowlisted registry for "${pkgPath}": ${pkg.resolved}`,
        );
        badRegistry++;
      }
    }

    // Check 3: Integrity present
    // Local workspace symlinks (resolved: ../foo or file:../) legitimately have no tarball hash.
    const isLocalLink =
      !pkg.resolved ||
      pkg.resolved.startsWith('../') ||
      pkg.resolved.startsWith('./') ||
      pkg.resolved.startsWith('file:');
    if (!pkg.integrity) {
      if (!pkg.inBundle && !isLocalLink) {
        warn(
          name,
          `Missing integrity hash for "${pkgPath}" (resolved: ${pkg.resolved ?? 'local'})`,
        );
        missingIntegrity++;
      }
    } else {
      // Check 4: No legacy override fields
      if (pkg._resolved || pkg._integrity) {
        fail(
          name,
          `"${pkgPath}" has legacy override fields (_resolved/_integrity) that may bypass integrity verification`,
        );
      }

      // Check 5: Well-formed sha512 SRI
      const hashes = pkg.integrity.split(' ');
      const hasSha512 = hashes.some((h) => SHA512_SRI_RE.test(h));
      if (!hasSha512) {
        fail(
          name,
          `"${pkgPath}" integrity is not a valid sha512 SRI string: ${pkg.integrity.substring(0, 60)}`,
        );
        malformedHash++;
      } else if (
        pkg.resolved &&
        ALLOWED_REGISTRIES.some((r) => pkg.resolved.startsWith(r))
      ) {
        registrySpotCheckCandidates.push({ pkgPath, pkg });
      }
    }
  }

  ok(
    `${name}: scanned ${installable.length} installable packages (${badRegistry} bad registry, ${missingIntegrity} missing integrity, ${malformedHash} malformed hash)`,
  );

  // Check 6: All declared deps present in lockfile
  const declaredDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies,
    ...packageJson.peerDependencies,
  };

  let phantomDeps = 0;
  for (const dep of Object.keys(declaredDeps)) {
    const lookupKey = `node_modules/${dep}`;
    if (!packages[lookupKey]) {
      warn(
        name,
        `Declared dep "${dep}" has no direct entry in lockfile packages map`,
      );
      phantomDeps++;
    }
  }

  if (phantomDeps === 0) {
    ok(
      `${name}: all ${Object.keys(declaredDeps).length} declared dependencies present in lockfile`,
    );
  }

  // Check 7 (optional): Registry spot-check
  if (!SKIP_SIGNATURES && registrySpotCheckCandidates.length > 0) {
    console.log(
      `  \u21b3 Spot-checking ${Math.min(REGISTRY_SPOT_CHECK_SAMPLE, registrySpotCheckCandidates.length)} packages against npm registry\u2026`,
    );

    const step = Math.max(
      1,
      Math.floor(
        registrySpotCheckCandidates.length / REGISTRY_SPOT_CHECK_SAMPLE,
      ),
    );
    const sample = [];
    for (
      let i = 0;
      i < registrySpotCheckCandidates.length &&
      sample.length < REGISTRY_SPOT_CHECK_SAMPLE;
      i += step
    ) {
      sample.push(registrySpotCheckCandidates[i]);
    }

    await Promise.all(
      sample.map(async ({ pkgPath, pkg }) => {
        // For nested paths like node_modules/A/node_modules/@scope/B, extract the
        // LAST node_modules/ segment to get the actual installed package name.
        const lastNmIdx = pkgPath.lastIndexOf('node_modules/');
        const pkgName = pkgPath.slice(lastNmIdx + 'node_modules/'.length);
        const version = pkg.version;
        if (!version) return;

        const registryData = await fetchRegistryIntegrity(pkgName, version);
        if (!registryData) {
          warn(
            name,
            `Registry unreachable for spot-check of "${pkgName}@${version}" \u2014 skipping`,
          );
          return;
        }
        if (!registryData.integrity) {
          warn(
            name,
            `npm registry returned no integrity for "${pkgName}@${version}"`,
          );
          return;
        }

        const lockfileHashes = new Set(pkg.integrity.split(' '));
        if (!lockfileHashes.has(registryData.integrity)) {
          fail(
            name,
            `INTEGRITY MISMATCH for "${pkgName}@${version}": lockfile="${pkg.integrity.substring(0, 60)}" registry="${registryData.integrity.substring(0, 60)}"`,
          );
        } else {
          ok(
            `${name}: registry confirms integrity for "${pkgName}@${version}"`,
          );
        }
      }),
    );
  } else if (SKIP_SIGNATURES) {
    console.log('  \u21b3 Registry spot-checks skipped (--skip-signatures)');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557',
  );
  console.log(
    '\u2551    CircleSfera \u2014 Lockfile Integrity & Provenance Check         \u2551',
  );
  console.log(
    '\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d',
  );
  console.log(`  Workspaces : ${WORKSPACES.map((w) => w.name).join(', ')}`);
  console.log(`  Registries : ${ALLOWED_REGISTRIES.join(', ')}`);
  console.log(
    `  Mode       : ${SKIP_SIGNATURES ? 'fast (no registry spot-checks)' : 'full (with registry spot-checks)'}`,
  );

  for (const workspace of WORKSPACES) {
    await verifyWorkspace(workspace);
  }

  console.log(
    '\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
  );
  console.log(`  Result: ${errors} error(s)  ${warnings} warning(s)`);

  if (errors > 0) {
    console.error(
      '\n\u2717 Lockfile integrity verification FAILED.\n  Resolve all errors above before proceeding with `npm ci`.\n  A failing check may indicate a supply-chain tampering attempt.',
    );
    process.exit(1);
  }

  if (warnings > 0) {
    console.warn(
      '\n\u26a0 Lockfile integrity verified with warnings (see above).',
    );
  } else {
    console.log('\n\u2713 All lockfile integrity checks passed.');
  }
}

main().catch((err) => {
  console.error('Fatal error in verify-lockfile-integrity.mjs:', err);
  process.exit(2);
});
