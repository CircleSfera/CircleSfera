// Run with: node --test scripts/scan-container-images.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classify,
  pinnedImages,
  sourcesFor,
} from './scan-container-images.mjs';

const D = 'a'.repeat(64);

function vuln(overrides) {
  return {
    VulnerabilityID: 'CVE-2026-0001',
    PkgName: 'pkg',
    InstalledVersion: '1.0.0',
    FixedVersion: '1.0.1',
    Severity: 'CRITICAL',
    PkgPath: 'app/circlesfera-backend/node_modules/pkg/package.json',
    ...overrides,
  };
}

function report(...vulns) {
  return {
    Results: [
      { Target: 'Node.js', Class: 'lang-pkgs', Vulnerabilities: vulns },
    ],
  };
}

test('a fixable CRITICAL in an application dependency of our own image blocks', () => {
  const { blocking, warnings } = classify(report(vuln({})), { own: true });
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].where, 'application');
  assert.equal(warnings.length, 0);
});

test('the same finding in a third-party image only warns', () => {
  const { blocking, warnings } = classify(report(vuln({})), { own: false });
  assert.equal(blocking.length, 0);
  assert.equal(warnings.length, 1);
});

test('a CRITICAL in software the base image carries (npm) only warns', () => {
  const npm = vuln({
    PkgPath: 'usr/local/lib/node_modules/npm/node_modules/undici/package.json',
  });
  const { blocking, warnings } = classify(report(npm), { own: true });
  assert.equal(blocking.length, 0);
  assert.equal(warnings[0].where, 'bundled software');
});

test('a CRITICAL in a system package of our own image only warns', () => {
  const os = {
    Results: [
      {
        Target: 'alpine',
        Class: 'os-pkgs',
        Vulnerabilities: [vuln({ PkgPath: undefined })],
      },
    ],
  };
  const { blocking, warnings } = classify(os, { own: true });
  assert.equal(blocking.length, 0);
  assert.equal(warnings[0].where, 'system');
});

test('a HIGH in an application dependency only warns', () => {
  const { blocking, warnings } = classify(report(vuln({ Severity: 'HIGH' })), {
    own: true,
  });
  assert.equal(blocking.length, 0);
  assert.equal(warnings.length, 1);
});

test('findings without a published fix, or below HIGH, are left out', () => {
  const unfixed = vuln({ FixedVersion: '' });
  const medium = vuln({ Severity: 'MEDIUM' });
  const { blocking, warnings } = classify(report(unfixed, medium), {
    own: true,
  });
  assert.equal(blocking.length + warnings.length, 0);
});

test('a report with no results has no findings', () => {
  assert.deepEqual(classify({}, { own: true }), { blocking: [], warnings: [] });
});

test('pinned images come from Dockerfiles and Compose files, once each, never from workflows', () => {
  const files = {
    'circlesfera-backend/Dockerfile': `FROM node:24-alpine@sha256:${D} AS build\nFROM node:24-alpine@sha256:${D}`,
    'docker-compose.prod.yml': `    image: redis:7-alpine@sha256:${D}\n    image: \${REGISTRY}/backend:latest`,
    '.github/workflows/pr.yml': `image: ghcr.io/x/mirror/redis:7-alpine@sha256:${D}`,
    'README.md': `node:24-alpine@sha256:${'b'.repeat(64)}`,
  };
  const pins = pinnedImages(Object.keys(files), (f) => files[f]);
  assert.deepEqual(pins, [`node:24-alpine@sha256:${D}`]);
});

test('one digest named through two mirrors is scanned once', () => {
  const E = 'c'.repeat(64);
  const files = {
    'circlesfera-frontend/Dockerfile': `FROM public.ecr.aws/docker/library/nginx:alpine@sha256:${E}`,
    'docker-compose.yml': `    image: nginx:alpine@sha256:${E}\n    image: redis:7-alpine@sha256:${D}`,
  };
  const pins = pinnedImages(Object.keys(files), (f) => files[f]);
  assert.deepEqual(pins, [
    `public.ecr.aws/docker/library/nginx:alpine@sha256:${E}`,
    `redis:7-alpine@sha256:${D}`,
  ]);
});

test('Docker Hub images are read from Google mirror first, by digest only', () => {
  assert.deepEqual(sourcesFor(`nginx:alpine@sha256:${D}`), [
    `mirror.gcr.io/library/nginx@sha256:${D}`,
    `docker.io/library/nginx@sha256:${D}`,
  ]);
  assert.deepEqual(sourcesFor(`livekit/egress:v1.15.0@sha256:${D}`), [
    `mirror.gcr.io/livekit/egress@sha256:${D}`,
    `docker.io/livekit/egress@sha256:${D}`,
  ]);
});

test('the public ECR mirror of Docker Hub falls back to Google mirror and Docker Hub', () => {
  assert.deepEqual(
    sourcesFor(`public.ecr.aws/docker/library/node:24-alpine@sha256:${D}`),
    [
      `public.ecr.aws/docker/library/node@sha256:${D}`,
      `mirror.gcr.io/library/node@sha256:${D}`,
      `docker.io/library/node@sha256:${D}`,
    ],
  );
});

test('an image of another registry is read only from it', () => {
  assert.deepEqual(
    sourcesFor(`ghcr.io/aquasecurity/trivy:0.76.1@sha256:${D}`),
    [`ghcr.io/aquasecurity/trivy@sha256:${D}`],
  );
});
