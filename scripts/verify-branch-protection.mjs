#!/usr/bin/env node

/**
 * CircleSfera Production Change Control Verification & Enforcement Tool
 *
 * Verifies that the production branch (`main`) satisfies change control requirements:
 * 1. Branch protection active.
 * 2. Required status checks enforced (CI Quality & Playwright Smoke).
 * 3. Pull request reviews mandated with stale approval dismissal.
 * 4. Conversation resolution enforced on all review threads.
 * 5. Admin enforcement enabled.
 * 6. Destructive actions (force pushes, deletions) blocked.
 *
 * Usage:
 *   node scripts/verify-branch-protection.mjs               # Verify & audit
 *   node scripts/verify-branch-protection.mjs --json        # JSON audit output
 *   node scripts/verify-branch-protection.mjs --enforce     # Enforce target policy
 */

import { execSync } from 'node:child_process';

const DEFAULT_REPO = 'CircleSfera/CircleSfera';
const DEFAULT_BRANCH = 'main';

const REQUIRED_STATUS_CHECKS = [
  'Run Lint and Unit Tests / Run Lint and Unit Tests',
  'Playwright Smoke (unauthenticated)',
];

const TARGET_POLICY = {
  required_status_checks: {
    strict: false,
    contexts: REQUIRED_STATUS_CHECKS,
  },
  enforce_admins: true,
  required_pull_request_reviews: {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: false,
    required_approving_review_count: 1,
    require_last_push_approval: false,
  },
  restrictions: null,
  required_conversation_resolution: true,
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    enforce: args.includes('--enforce') || args.includes('--fix'),
    json: args.includes('--json'),
    help: args.includes('--help') || args.includes('-h'),
    repo: process.env.GITHUB_REPOSITORY || DEFAULT_REPO,
    branch: process.env.TARGET_BRANCH || DEFAULT_BRANCH,
  };
}

function printUsage() {
  console.log(`
CircleSfera Branch Protection Verification Tool

Usage:
  node scripts/verify-branch-protection.mjs [options]

Options:
  --enforce, --fix   Apply required branch protection rules via GitHub API
  --json             Output results in JSON format
  --help, -h         Show this help message

Environment Variables:
  GITHUB_TOKEN       GitHub API token (optional if gh CLI is authenticated)
  GITHUB_REPOSITORY  Target repository (default: ${DEFAULT_REPO})
  TARGET_BRANCH      Target branch (default: ${DEFAULT_BRANCH})
`);
}

function runGhApi(endpoint, method = 'GET', body = null) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const methodFlag = method !== 'GET' ? `-X ${method}` : '';
  const inputFlag = body ? '--input -' : '';
  const cmd = `gh api ${methodFlag} ${endpoint} ${inputFlag}`.trim();

  const env = { ...process.env };
  if (token) {
    env.GH_TOKEN = token;
  }

  try {
    const stdout = execSync(cmd, {
      input: body ? JSON.stringify(body) : undefined,
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, data: JSON.parse(stdout) };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    return { ok: false, error: stderr };
  }
}

function auditProtection(protection) {
  const findings = [];

  // 1. Enforce Admins
  const enforceAdmins = Boolean(protection.enforce_admins?.enabled);
  findings.push({
    rule: 'Enforce Admins',
    expected: true,
    actual: enforceAdmins,
    passed: enforceAdmins === true,
  });

  // 2. Force Pushes
  const allowForcePushes = Boolean(protection.allow_force_pushes?.enabled);
  findings.push({
    rule: 'Block Force Pushes',
    expected: true,
    actual: !allowForcePushes,
    passed: allowForcePushes === false,
  });

  // 3. Deletions
  const allowDeletions = Boolean(protection.allow_deletions?.enabled);
  findings.push({
    rule: 'Block Branch Deletion',
    expected: true,
    actual: !allowDeletions,
    passed: allowDeletions === false,
  });

  // 4. Conversation Resolution
  const convResolution = Boolean(
    protection.required_conversation_resolution?.enabled,
  );
  findings.push({
    rule: 'Require Conversation Resolution',
    expected: true,
    actual: convResolution,
    passed: convResolution === true,
  });

  // 5. Pull Request Reviews
  const prReviews = protection.required_pull_request_reviews;
  const reviewCount = prReviews ? prReviews.required_approving_review_count : 0;
  const dismissStale = prReviews
    ? Boolean(prReviews.dismiss_stale_reviews)
    : false;

  findings.push({
    rule: 'Require Pull Request Reviews',
    expected: '>= 1 approving review',
    actual: prReviews ? `${reviewCount} review(s)` : 'Disabled',
    passed: Boolean(prReviews && reviewCount >= 1),
  });

  findings.push({
    rule: 'Dismiss Stale Reviews on Push',
    expected: true,
    actual: dismissStale,
    passed: dismissStale === true,
  });

  // 6. Required Status Checks
  const statusChecks = protection.required_status_checks;
  const contexts = statusChecks ? statusChecks.contexts || [] : [];
  const missingContexts = REQUIRED_STATUS_CHECKS.filter(
    (c) => !contexts.includes(c),
  );

  findings.push({
    rule: 'Require CI Status Checks',
    expected: 'Enabled with canonical CI contexts',
    actual: statusChecks
      ? `${contexts.length} context(s) configured`
      : 'Disabled',
    passed: Boolean(statusChecks && missingContexts.length === 0),
    details:
      missingContexts.length > 0
        ? `Missing: ${missingContexts.join(', ')}`
        : 'All required checks present',
  });

  return findings;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const endpoint = `repos/${args.repo}/branches/${args.branch}/protection`;

  if (args.enforce) {
    if (!args.json) {
      console.log(
        `Applying production branch protection policy on ${args.repo}:${args.branch}...`,
      );
    }
    const updateResult = runGhApi(endpoint, 'PUT', TARGET_POLICY);
    if (!updateResult.ok) {
      console.error(
        `Failed to enforce branch protection: ${updateResult.error}`,
      );
      process.exit(1);
    }
    if (!args.json) {
      console.log('Branch protection policy successfully applied.');
    }
  }

  const fetchResult = runGhApi(endpoint);
  if (!fetchResult.ok) {
    if (args.json) {
      console.log(
        JSON.stringify({ passed: false, error: fetchResult.error }, null, 2),
      );
    } else {
      console.error(
        `Failed to retrieve branch protection: ${fetchResult.error}`,
      );
    }
    process.exit(1);
  }

  const findings = auditProtection(fetchResult.data);
  const allPassed = findings.every((f) => f.passed);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          repository: args.repo,
          branch: args.branch,
          passed: allPassed,
          timestamp: new Date().toISOString(),
          findings,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `\n=== CircleSfera Branch Protection Audit [${args.repo}:${args.branch}] ===\n`,
    );
    console.log(
      'Rule'.padEnd(35) +
        'Status'.padEnd(10) +
        'Expected'.padEnd(30) +
        'Actual',
    );
    console.log('-'.repeat(95));

    for (const f of findings) {
      const status = f.passed ? 'PASS' : 'FAIL';
      const icon = f.passed ? '✓' : '✗';
      const expected = String(f.expected).padEnd(30);
      const actual =
        String(f.actual) + (f.details && !f.passed ? ` (${f.details})` : '');
      console.log(
        `${icon} ${f.rule.padEnd(33)} ${status.padEnd(10)}${expected}${actual}`,
      );
    }

    console.log('-'.repeat(95));
    if (allPassed) {
      console.log(
        '\nAll production change control rules are active and verified.\n',
      );
    } else {
      console.log('\nOne or more branch protection rules failed verification.');
      console.log(
        'Run with --enforce to synchronize repository protection rules.\n',
      );
    }
  }

  process.exit(allPassed ? 0 : 1);
}

main();
