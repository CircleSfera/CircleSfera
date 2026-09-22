#!/usr/bin/env node

/**
 * Dependency Vulnerability Audit & Exception Engine
 *
 * Scans all workspaces (root, backend, frontend, shared) using `npm audit`,
 * evaluates vulnerabilities against production severity policies (Critical/High),
 * and validates approved temporary exemptions in `.dependency-security-exceptions.json`.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT_DIR = resolve(import.meta.dirname, '..');
const EXCEPTIONS_FILE = resolve(
  ROOT_DIR,
  '.dependency-security-exceptions.json',
);

const WORKSPACES = [
  { name: 'root', path: ROOT_DIR },
  { name: 'backend', path: resolve(ROOT_DIR, 'circlesfera-backend') },
  { name: 'frontend', path: resolve(ROOT_DIR, 'circlesfera-frontend') },
  { name: 'shared', path: resolve(ROOT_DIR, 'circlesfera-shared') },
];

const args = process.argv.slice(2);
const isAll = args.includes('--all');
const isJsonOutput = args.includes('--json');
const isStrict = args.includes('--strict');

function loadExceptions() {
  if (!existsSync(EXCEPTIONS_FILE)) {
    return [];
  }
  try {
    const raw = readFileSync(EXCEPTIONS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data.exceptions || [];
  } catch (err) {
    console.error(`❌ Failed to parse ${EXCEPTIONS_FILE}: ${err.message}`);
    process.exit(1);
  }
}

function validateExceptions(exceptions) {
  const now = new Date();
  const valid = [];
  let expiredCount = 0;

  for (const ex of exceptions) {
    const required = [
      'package',
      'advisoryId',
      'severity',
      'reason',
      'mitigation',
      'expiresAt',
      'approvedBy',
    ];
    for (const field of required) {
      if (!ex[field]) {
        console.error(
          `❌ Invalid exception for package "${ex.package || 'unknown'}": missing required field "${field}".`,
        );
        process.exit(1);
      }
    }

    const expiry = new Date(ex.expiresAt);
    if (Number.isNaN(expiry.getTime())) {
      console.error(
        `❌ Invalid date in exception for "${ex.package}": "${ex.expiresAt}" is not a valid ISO 8601 date.`,
      );
      process.exit(1);
    }

    if (expiry < now) {
      console.error(
        `❌ EXPIRED EXCEPTION: ${ex.package} (${ex.advisoryId}) expired on ${ex.expiresAt}. Remediate the dependency or obtain re-approval.`,
      );
      expiredCount++;
    } else {
      valid.push(ex);
    }
  }

  if (expiredCount > 0) {
    console.error(
      `\n❌ Found ${expiredCount} expired security exception(s). Blocking audit.`,
    );
    process.exit(1);
  }

  return valid;
}

function runAuditForWorkspace(ws) {
  const omitFlag = isAll ? '' : '--omit=dev';
  const cmd = `npm audit ${omitFlag} --json`;

  try {
    const stdout = execSync(cmd, {
      cwd: ws.path,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    // npm audit exits with non-zero code if vulnerabilities exist
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        // fall through
      }
    }
    console.error(`❌ Failed to run npm audit in ${ws.name}: ${err.message}`);
    return null;
  }
}

function extractVulnerabilities(auditReport) {
  if (!auditReport?.vulnerabilities) {
    return [];
  }

  const list = [];
  for (const [pkgName, vulnData] of Object.entries(
    auditReport.vulnerabilities,
  )) {
    const advisories = Array.isArray(vulnData.via) ? vulnData.via : [];
    for (const item of advisories) {
      if (typeof item === 'object' && item !== null) {
        list.push({
          package: pkgName,
          title: item.title,
          severity: item.severity || vulnData.severity,
          url: item.url,
          range: item.range || vulnData.range,
          advisoryId: String(
            item.source || item.url?.split('/').pop() || 'unknown',
          ),
        });
      }
    }
    if (
      advisories.length === 0 ||
      advisories.every((i) => typeof i === 'string')
    ) {
      list.push({
        package: pkgName,
        title: 'Transitive vulnerability',
        severity: vulnData.severity,
        range: vulnData.range,
        advisoryId: 'transitive',
      });
    }
  }
  return list;
}

function main() {
  if (!isJsonOutput) {
    console.log('=== CircleSfera Dependency Vulnerability Audit ===');
    console.log(
      `Scan Mode: ${isAll ? 'All dependencies (including devDependencies)' : 'Production dependencies only (--omit=dev)'}`,
    );
    console.log(
      `Severity Policy: Critical (24h SLA), High (7d SLA) ${isStrict ? '+ Moderate' : ''}`,
    );
  }

  const rawExceptions = loadExceptions();
  const validExceptions = validateExceptions(rawExceptions);

  if (!isJsonOutput && validExceptions.length > 0) {
    console.log(
      `Loaded ${validExceptions.length} active security exception(s).`,
    );
  }

  let totalVulnerabilities = 0;
  let blockingVulnerabilities = 0;
  const workspaceResults = [];

  for (const ws of WORKSPACES) {
    const report = runAuditForWorkspace(ws);
    if (!report) {
      workspaceResults.push({ name: ws.name, status: 'ERROR' });
      blockingVulnerabilities++;
      continue;
    }

    const vulns = extractVulnerabilities(report);
    const unexempt = [];

    for (const v of vulns) {
      const isExempt = validExceptions.some(
        (ex) =>
          ex.package.toLowerCase() === v.package.toLowerCase() &&
          (ex.advisoryId === '*' ||
            ex.advisoryId.toLowerCase() === v.advisoryId.toLowerCase() ||
            v.url?.includes(ex.advisoryId)),
      );

      if (!isExempt) {
        unexempt.push(v);
        totalVulnerabilities++;
        const isBlocking =
          v.severity === 'critical' ||
          v.severity === 'high' ||
          (isStrict && v.severity === 'moderate');
        if (isBlocking) {
          blockingVulnerabilities++;
        }
      }
    }

    workspaceResults.push({
      name: ws.name,
      metadata: report.metadata?.vulnerabilities || {},
      unexempt,
      status: unexempt.length === 0 ? 'PASS' : 'FAIL',
    });
  }

  if (isJsonOutput) {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          scanMode: isAll ? 'all' : 'prod-only',
          totalVulnerabilities,
          blockingVulnerabilities,
          workspaceResults,
        },
        null,
        2,
      ),
    );
    process.exit(blockingVulnerabilities > 0 ? 1 : 0);
  }

  console.log('\n--- Audit Results by Workspace ---');
  for (const res of workspaceResults) {
    const meta = res.metadata;
    console.log(
      `\nWorkspace: ${res.name.toUpperCase()} | Status: ${res.unexempt?.length === 0 ? '✅ PASS' : '❌ FINDINGS'}`,
    );
    console.log(
      `  Total audited: ${meta.total ?? 0} (Critical: ${meta.critical ?? 0}, High: ${meta.high ?? 0}, Moderate: ${meta.moderate ?? 0}, Low: ${meta.low ?? 0})`,
    );

    if (res.unexempt && res.unexempt.length > 0) {
      console.log('  Unexempt Vulnerabilities:');
      for (const u of res.unexempt) {
        console.log(
          `    - [${u.severity.toUpperCase()}] ${u.package} (${u.range || 'all'}): ${u.title} (Ref: ${u.advisoryId})`,
        );
      }
    }
  }

  console.log('\n==================================================');
  console.log(`Total Unexempt Findings: ${totalVulnerabilities}`);
  console.log(`Blocking Findings (Critical/High): ${blockingVulnerabilities}`);

  if (blockingVulnerabilities > 0) {
    console.error(
      '\n❌ AUDIT FAILED: Unexempt Critical or High vulnerabilities detected.',
    );
    console.error(
      'Remediate dependencies or file an exception in .dependency-security-exceptions.json following doc 10.',
    );
    process.exit(1);
  } else {
    console.log(
      '\n✅ AUDIT PASSED: Zero unexempt blocking vulnerabilities found.',
    );
    process.exit(0);
  }
}

main();
