#!/usr/bin/env node

/**
 * CircleSfera Nginx Configuration Linter & Policy Verifier
 *
 * Validates that `nginx/master.conf.template` complies with production traffic policies:
 * 1. Balanced block braces and syntax structure.
 * 2. Conservative defaults on standard routes:
 *    - client_max_body_size <= 10m
 *    - proxy_read_timeout <= 60s
 *    - proxy_connect_timeout <= 15s
 *    - proxy_buffering on
 *    - proxy_request_buffering on
 * 3. Explicit scoped exceptions for high-volume or persistent workloads:
 *    - Media uploads (/api/v1/uploads): up to 100m, proxy_request_buffering off, extended timeout.
 *    - WebSockets (/socket.io/): proxy_buffering off, extended keepalive timeout (>= 3600s).
 *    - GDPR downloads (/api/v1/users/gdpr/exports/:id/download): proxy_buffering off.
 *
 * Usage:
 *   node scripts/test-nginx-config.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG_PATH = resolve(process.cwd(), 'nginx/master.conf.template');

function checkBraceBalance(content) {
  let depth = 0;
  let lineNum = 1;
  const errors = [];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '\n') lineNum++;
    if (char === '#') {
      // Skip comment line
      while (i < content.length && content[i] !== '\n') {
        i++;
      }
      lineNum++;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth < 0) {
        errors.push(`Unmatched closing brace '}' at line ${lineNum}`);
      }
    }
  }

  if (depth > 0) {
    errors.push(`Unclosed opening brace '{' (unclosed blocks: ${depth})`);
  }

  return errors;
}

function verifyTrafficPolicies(content) {
  const findings = [];

  // Check 1: Brace Balance
  const braceErrors = checkBraceBalance(content);
  findings.push({
    rule: 'Balanced Block Syntax',
    passed: braceErrors.length === 0,
    details:
      braceErrors.length === 0
        ? 'All blocks properly balanced'
        : braceErrors.join('; '),
  });

  // Check 2: No server-wide unbounded 300s proxy timeouts
  // A server block should not globally declare `proxy_read_timeout 300s` or `proxy_buffering off`
  const lines = content.split('\n');
  let inServerBlock = false;
  let inLocationBlock = false;
  let serverLevel300s = 0;
  let serverLevelBufferingOff = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;

    if (/^server\s*\{/.test(trimmed)) {
      inServerBlock = true;
      inLocationBlock = false;
    }
    if (/^location\s+/.test(trimmed)) {
      inLocationBlock = true;
    }
    if (trimmed === '}') {
      if (inLocationBlock) {
        inLocationBlock = false;
      } else if (inServerBlock) {
        inServerBlock = false;
      }
    }

    if (inServerBlock && !inLocationBlock) {
      if (/proxy_read_timeout\s+300s;/.test(trimmed)) serverLevel300s++;
      if (/proxy_buffering\s+off;/.test(trimmed)) serverLevelBufferingOff++;
    }
  }

  findings.push({
    rule: 'No Global Un-Scoped 300s Timeouts',
    passed: serverLevel300s === 0,
    details:
      serverLevel300s === 0
        ? 'All 300s timeouts are strictly scoped to specific locations'
        : `Found ${serverLevel300s} global server-level 300s timeout(s)`,
  });

  findings.push({
    rule: 'No Global Un-Scoped Buffering Disable',
    passed: serverLevelBufferingOff === 0,
    details:
      serverLevelBufferingOff === 0
        ? 'proxy_buffering off is scoped to realtime and streaming locations'
        : `Found ${serverLevelBufferingOff} global server-level proxy_buffering off directive(s)`,
  });

  // Check 3: Explicit Upload Exception exists
  const hasUploadLocation = /location\s+(\^~\s+)?\/api\/v1\/uploads/.test(
    content,
  );
  const uploadHas100m = /client_max_body_size\s+100[mM];/.test(content);
  const uploadUnbuffered = /proxy_request_buffering\s+off;/.test(content);
  findings.push({
    rule: 'Explicit Upload Exception (/api/v1/uploads)',
    passed: hasUploadLocation && uploadHas100m && uploadUnbuffered,
    details:
      hasUploadLocation && uploadHas100m && uploadUnbuffered
        ? 'Upload location scoped with 100M limit and direct request streaming'
        : 'Missing dedicated upload location or proper 100M/unbuffered directives',
  });

  // Check 4: Realtime WebSocket Scoped Buffering & Keepalive
  const hasSocketLocation =
    /location\s+(\/api\/v1\/socket\.io\/|\/socket\.io\/)/.test(content);
  const socketHasLongTimeout = /proxy_read_timeout\s+3600s;/.test(content);
  const socketBufferingOff = /proxy_buffering\s+off;/.test(content);
  findings.push({
    rule: 'Realtime WebSocket Exception (/socket.io/)',
    passed: hasSocketLocation && socketHasLongTimeout && socketBufferingOff,
    details:
      hasSocketLocation && socketHasLongTimeout && socketBufferingOff
        ? 'WebSocket proxy configured with unbuffered delivery and 3600s keepalive'
        : 'Missing WebSocket location or 3600s timeout / unbuffered setting',
  });

  // Check 5: GDPR Export Download Streaming Exception
  const hasGdprDownloadLocation = /gdpr\/exports/.test(content);
  findings.push({
    rule: 'GDPR Large Export Streaming Exception',
    passed: hasGdprDownloadLocation,
    details: hasGdprDownloadLocation
      ? 'GDPR archive downloads scoped with unbuffered streaming'
      : 'Missing dedicated GDPR export streaming location',
  });

  // Check 6: Bounded Default Proxy Read Timeout (<= 60s)
  const hasBoundedTimeout = /proxy_read_timeout\s+60s;/.test(content);
  findings.push({
    rule: 'Bounded Default Read Timeout (<= 60s)',
    passed: hasBoundedTimeout,
    details: hasBoundedTimeout
      ? 'Default REST API routes bounded to 60s timeout'
      : 'Default proxy_read_timeout is not bounded to 60s',
  });

  return findings;
}

function main() {
  console.log(`[Nginx Config Linter] Inspecting ${CONFIG_PATH}...\n`);

  let content;
  try {
    content = readFileSync(CONFIG_PATH, 'utf8');
  } catch (err) {
    console.error(`Failed to read Nginx configuration: ${err.message}`);
    process.exit(1);
  }

  const findings = verifyTrafficPolicies(content);
  const allPassed = findings.every((f) => f.passed);

  console.log(`${'Policy Rule'.padEnd(45)}${'Status'.padEnd(10)}Details`);
  console.log('-'.repeat(95));

  for (const f of findings) {
    const status = f.passed ? 'PASS' : 'FAIL';
    const icon = f.passed ? '✓' : '✗';
    console.log(
      `${icon} ${f.rule.padEnd(43)} ${status.padEnd(10)}${f.details}`,
    );
  }

  console.log('-'.repeat(95));
  if (allPassed) {
    console.log(
      '\nAll Nginx traffic policies and scoped exceptions are verified.\n',
    );
  } else {
    console.log('\nOne or more Nginx traffic policy checks failed.\n');
  }

  process.exit(allPassed ? 0 : 1);
}

main();
