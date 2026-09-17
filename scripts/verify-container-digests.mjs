#!/usr/bin/env node

/**
 * Static Container Image Digest Verification Script
 *
 * Validates that all production Dockerfiles, Compose manifests, and CI service
 * container definitions specify immutable `@sha256:` cryptographic digests,
 * preventing supply chain drift and unpinned floating tags.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT_DIR = resolve(import.meta.dirname, '..');

const DIGEST_REGEX = /^[a-f0-9]{64}$/;

let totalChecks = 0;
let failedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (!condition) {
    failedChecks++;
    console.error(`❌ ${message}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

function verifyDockerfile(relPath) {
  const fullPath = resolve(ROOT_DIR, relPath);
  const content = readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  console.log(`\nInspecting Dockerfile: ${relPath}`);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('FROM ')) {
      const match = line.match(/^FROM\s+([^\s@]+)@sha256:([a-f0-9]{64})(.*)$/i);
      const isPinned = match !== null && DIGEST_REGEX.test(match[2]);

      assert(
        isPinned,
        `${relPath}:${i + 1} - Base image must specify immutable @sha256 digest: ${line}`,
      );

      if (isPinned) {
        console.log(
          `   Pinned image: ${match[1]} | Digest: sha256:${match[2].slice(0, 16)}...`,
        );
      }
    }
  }
}

function verifyComposeFile(relPath, requiredServices) {
  const fullPath = resolve(ROOT_DIR, relPath);
  const content = readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  console.log(`\nInspecting Compose manifest: ${relPath}`);
  let currentService = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const serviceMatch = line.match(/^ {2}([a-zA-Z0-9_-]+):/);
    if (serviceMatch) {
      currentService = serviceMatch[1];
    }

    const imageMatch = line.match(/^\s+image:\s+(.+)$/);
    if (
      imageMatch &&
      currentService &&
      requiredServices.includes(currentService)
    ) {
      const rawImage = imageMatch[1].trim();
      const digestMatch = rawImage.match(/^([^\s@]+)@sha256:([a-f0-9]{64})$/);
      const isPinned =
        digestMatch !== null && DIGEST_REGEX.test(digestMatch[2]);

      assert(
        isPinned,
        `${relPath}:${i + 1} [service: ${currentService}] - Image must specify immutable @sha256 digest: ${rawImage}`,
      );

      if (isPinned) {
        console.log(
          `   Service "${currentService}": ${digestMatch[1]} | Digest: sha256:${digestMatch[2].slice(0, 16)}...`,
        );
      }
    }
  }
}

function verifyWorkflowServices(relPath) {
  const fullPath = resolve(ROOT_DIR, relPath);
  const content = readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  console.log(`\nInspecting Workflow services: ${relPath}`);
  let inServices = false;
  let currentService = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^\s+services:/)) {
      inServices = true;
      continue;
    }
    if (inServices && line.match(/^[a-zA-Z0-9_-]+:/) && !line.startsWith(' ')) {
      inServices = false;
    }

    if (inServices) {
      const serviceMatch = line.match(/^ {6}([a-zA-Z0-9_-]+):/);
      if (serviceMatch) {
        currentService = serviceMatch[1];
      }

      const imageMatch = line.match(/^ {8}image:\s+(.+)$/);
      if (imageMatch && currentService) {
        const rawImage = imageMatch[1].trim();
        const digestMatch = rawImage.match(/^([^\s@]+)@sha256:([a-f0-9]{64})$/);
        const isPinned =
          digestMatch !== null && DIGEST_REGEX.test(digestMatch[2]);

        assert(
          isPinned,
          `${relPath}:${i + 1} [service: ${currentService}] - Service image must specify immutable @sha256 digest: ${rawImage}`,
        );

        if (isPinned) {
          console.log(
            `   Service "${currentService}": ${digestMatch[1]} | Digest: sha256:${digestMatch[2].slice(0, 16)}...`,
          );
        }
      }
    }
  }
}

console.log('=== Container Image Digest Verification ===');

// 1. Production Dockerfiles
verifyDockerfile('circlesfera-backend/Dockerfile');
verifyDockerfile('circlesfera-frontend/Dockerfile');

// 2. Production & Dev Compose files
verifyComposeFile('docker-compose.prod.yml', [
  'nginx-proxy',
  'postgres',
  'redis',
]);
verifyComposeFile('docker-compose.yml', ['postgres', 'redis', 'proxy']);
verifyComposeFile('circlesfera-backend/docker-compose.dev.yml', [
  'postgres',
  'redis',
]);
verifyComposeFile('docker-compose.e2e.yml', ['postgres-e2e']);

// 3. CI Workflows with service containers
verifyWorkflowServices('.github/workflows/ci-quality.yml');
verifyWorkflowServices('.github/workflows/pr.yml');
verifyWorkflowServices('.github/workflows/playwright-nightly.yml');

console.log('\n=== Verification Summary ===');
console.log(`Total checks: ${totalChecks}`);
console.log(`Passed: ${totalChecks - failedChecks}`);
console.log(`Failed: ${failedChecks}`);

if (failedChecks > 0) {
  console.error(
    '\n❌ One or more container images are floating or lack @sha256 digests.',
  );
  process.exit(1);
} else {
  console.log(
    '\n✅ All container base and service images are pinned to immutable @sha256 digests.',
  );
  process.exit(0);
}
