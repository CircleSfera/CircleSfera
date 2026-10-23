#!/usr/bin/env node

/**
 * Scans the container images CircleSfera runs for known vulnerabilities, with
 * Trivy run from its official image (pinned by digest below).
 *
 * Scanned:
 *   - each image given with --own, built from this checkout (read from the
 *     local Docker daemon);
 *   - every image pinned by digest in the Dockerfiles and the Compose files,
 *     read from the first public source that serves its digest.
 *
 * Only HIGH and CRITICAL findings with a published fix are reported. The run
 * fails only on a CRITICAL finding in an application dependency of one of our
 * own images (under /app), which we can fix ourselves. Everything else (the
 * packages and tools of a base image, third-party service images, an image
 * that cannot be read) is a warning: it moves when its maintainer rebuilds
 * the image and the Image digests workflow picks the new digest.
 *
 * Writes a Markdown report to the --summary file (appends), and prints only
 * image names and advisories.
 *
 * The pinned images are read from the files as committed (HEAD).
 *
 * Usage: node scripts/scan-container-images.mjs [--own <image>]... [--summary <file>]
 * Needs docker. Run from the repository root.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TRIVY_IMAGE =
  'ghcr.io/aquasecurity/trivy:0.76.1@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c';

const PIN_REGEX = /[A-Za-z0-9./_-]+:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}/g;
const FILE_REGEX = /(^|\/)Dockerfile[^/]*$|(^|\/)docker-compose[^/]*\.ya?ml$/;

/**
 * Every image pinned by digest in the given files, in order, once per digest
 * (one image named through two mirrors is scanned once).
 */
export function pinnedImages(files, read) {
  const byDigest = new Map();
  for (const file of files) {
    if (!FILE_REGEX.test(file) || file.startsWith('.github/')) continue;
    for (const pin of read(file).match(PIN_REGEX) ?? []) {
      const digest = pin.slice(pin.indexOf('@'));
      if (!byDigest.has(digest)) byDigest.set(digest, pin);
    }
  }
  return [...byDigest.values()];
}

/**
 * Where a pinned image can be read, by its digest (the tag is dropped: the
 * digest is the image). Docker Hub images are tried on Google's mirror first,
 * which does not count against Docker Hub's allowance of downloads.
 */
export function sourcesFor(pin) {
  const at = pin.indexOf('@');
  const name = pin.slice(0, at).replace(/:[^/]+$/, '');
  const digest = pin.slice(at);
  const ecrLibrary = 'public.ecr.aws/docker/library/';
  if (name.startsWith(ecrLibrary)) {
    const short = name.slice(ecrLibrary.length);
    return [
      `${name}${digest}`,
      `mirror.gcr.io/library/${short}${digest}`,
      `docker.io/library/${short}${digest}`,
    ];
  }
  const first = name.split('/')[0];
  const hasRegistry =
    name.includes('/') && (first.includes('.') || first.includes(':'));
  if (hasRegistry) return [`${name}${digest}`];
  const path = name.includes('/') ? name : `library/${name}`;
  return [`mirror.gcr.io/${path}${digest}`, `docker.io/${path}${digest}`];
}

/**
 * Splits the findings of one Trivy JSON report. `own` says whether the image
 * is built from this repository.
 */
export function classify(report, { own }) {
  const blocking = [];
  const warnings = [];
  for (const result of report.Results ?? []) {
    for (const vuln of result.Vulnerabilities ?? []) {
      if (!vuln.FixedVersion) continue;
      if (vuln.Severity !== 'CRITICAL' && vuln.Severity !== 'HIGH') continue;
      const path = vuln.PkgPath ?? '';
      const inApp =
        own && (path.startsWith('app/') || path.startsWith('/app/'));
      const finding = {
        id: vuln.VulnerabilityID,
        severity: vuln.Severity,
        pkg: vuln.PkgName,
        installed: vuln.InstalledVersion,
        fixed: vuln.FixedVersion,
        where: inApp
          ? 'application'
          : result.Class === 'os-pkgs'
            ? 'system'
            : 'bundled software',
      };
      if (inApp && vuln.Severity === 'CRITICAL') blocking.push(finding);
      else warnings.push(finding);
    }
  }
  return { blocking, warnings };
}

function trivy(ref, { local, cacheDir }) {
  const args = ['run', '--rm', '-v', `${cacheDir}:/root/.cache`];
  if (local) args.push('-v', '/var/run/docker.sock:/var/run/docker.sock');
  args.push(
    TRIVY_IMAGE,
    'image',
    '--quiet',
    '--scanners',
    'vuln',
    '--severity',
    'HIGH,CRITICAL',
    '--ignore-unfixed',
    '--format',
    'json',
    '--image-src',
    local ? 'docker' : 'remote',
    ref,
  );
  const out = execFileSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

function scan(image, { own, cacheDir }) {
  const refs = own ? [image] : sourcesFor(image);
  for (const ref of refs) {
    try {
      return {
        ...classify(trivy(ref, { local: own, cacheDir }), { own }),
        read: true,
      };
    } catch {
      console.log(`Could not scan ${ref}`);
    }
  }
  return { blocking: [], warnings: [], read: false };
}

function rows(findings) {
  return findings.map(
    (f) =>
      `| \`${f.pkg}\` | ${f.installed} → ${f.fixed} | ${f.id} | ${f.severity} | ${f.where} |`,
  );
}

function main(argv) {
  const own = [];
  let summary = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--own') own.push(argv[++i]);
    else if (argv[i] === '--summary') summary = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  const cacheDir =
    process.env.TRIVY_CACHE_DIR ??
    join(process.env.RUNNER_TEMP ?? tmpdir(), 'trivy-cache');
  mkdirSync(cacheDir, { recursive: true });

  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  // The files as committed: a build step may have pointed the working copy
  // of a Dockerfile at this repository's own copies of the base images.
  const pinned = pinnedImages(files, (file) =>
    execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }),
  );
  const images = [
    ...own.map((image) => ({ image, own: true })),
    ...pinned.map((image) => ({ image, own: false })),
  ];

  const lines = [
    '## Image vulnerabilities',
    '',
    'HIGH and CRITICAL findings with a published fix.',
    '',
  ];
  lines.push('| Image | Blocking | Warnings |', '| --- | --- | --- |');
  const details = [];
  let blockingTotal = 0;
  for (const { image, own: isOwn } of images) {
    const label = image.replace(/@sha256:([0-9a-f]{12})[0-9a-f]+$/, '@$1');
    console.log(`Scanning ${label}`);
    const { blocking, warnings, read } = scan(image, { own: isOwn, cacheDir });
    blockingTotal += blocking.length;
    if (!read) {
      lines.push(`| \`${label}\` | could not be read | |`);
      console.log(`::warning::Could not scan ${label}`);
      continue;
    }
    lines.push(`| \`${label}\` | ${blocking.length} | ${warnings.length} |`);
    if (blocking.length > 0)
      console.log(`::error::${label}: ${blocking.map((f) => f.id).join(', ')}`);
    if (warnings.length > 0)
      console.log(
        `::warning::${label}: ${warnings.length} fixable HIGH or CRITICAL findings`,
      );
    if (blocking.length + warnings.length > 0) {
      details.push(
        '',
        `### \`${label}\``,
        '',
        '| Package | Version | Advisory | Severity | Where |',
      );
      details.push(
        '| --- | --- | --- | --- | --- |',
        ...rows([...blocking, ...warnings]),
      );
    }
  }
  const report = [...lines, ...details, ''].join('\n');
  console.log(report);
  if (summary) appendFileSync(summary, report);
  if (blockingTotal > 0) {
    console.log(
      `${blockingTotal} CRITICAL findings in our own application dependencies.`,
    );
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2));
}
