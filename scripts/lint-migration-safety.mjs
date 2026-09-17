#!/usr/bin/env node
/**
 * Migration Safety Linter for CircleSfera
 *
 * Scans Prisma migration SQL files to enforce Expand/Contract compatibility
 * rules and prevent dangerous breaking statements that violate N-1 application
 * compatibility.
 *
 * Usage:
 *   node scripts/lint-migration-safety.mjs [--strict-all] [--migration <dir>] [--staged]
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(
  ROOT_DIR,
  'circlesfera-backend',
  'prisma',
  'migrations',
);

// Migrations prior to this timestamp are pre-existing historical production migrations.
// They are audited as advisory to preserve immutable migration hashes.
export const HISTORICAL_BASELINE = '20260910000000';

const args = process.argv.slice(2);
const isStrictAll = args.includes('--strict-all');
const isStagedOnly = args.includes('--staged');
const targetMigrationIndex = args.indexOf('--migration');
const targetMigration =
  targetMigrationIndex !== -1 ? args[targetMigrationIndex + 1] : null;

// Rules defining potentially destructive or narrowing operations
export const SAFETY_RULES = [
  {
    id: 'DROP_COLUMN',
    name: 'Drop Column detected',
    regex:
      /\bALTER\s+TABLE\s+["`]?(\w+)["`]?\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?["`]?(\w+)["`]?/i,
    severity: 'WARNING',
    description:
      'Dropping a column breaks N-1 application reads. Must be done only in Phase 3 (Contract) after all code stops reading from it.',
  },
  {
    id: 'DROP_TABLE',
    name: 'Drop Table detected',
    regex: /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?(\w+)["`]?/i,
    severity: 'WARNING',
    description:
      'Dropping a table breaks previous versions querying this entity. Must follow the 3-phase deprecation cycle.',
  },
  {
    id: 'RENAME_COLUMN',
    name: 'Rename Column detected',
    regex:
      /\bALTER\s+TABLE\s+["`]?(\w+)["`]?\s+RENAME\s+COLUMN\s+["`]?(\w+)["`]?\s+TO\s+["`]?(\w+)["`]?/i,
    severity: 'ERROR',
    description:
      'Renaming a column directly breaks N-1 queries immediately. Use Add -> Dual-write -> Backfill -> Drop instead.',
  },
  {
    id: 'ADD_NOT_NULL_NO_DEFAULT',
    name: 'Add NOT NULL column without DEFAULT detected',
    // Matches ADD COLUMN ... NOT NULL without DEFAULT keyword
    regex:
      /\bADD\s+COLUMN\s+["`]?\w+["`]?\s+[^;]+?\bNOT\s+NULL\b(?![^;]*\bDEFAULT\b)/i,
    severity: 'ERROR',
    description:
      'Adding a NOT NULL column without a DEFAULT causes N-1 application writes to fail constraint checks.',
  },
];

/**
 * Analyzes a SQL string against safety rules, respecting in-line safety overrides.
 */
export function analyzeMigrationSql(sqlContent, filename = 'migration.sql') {
  const issues = [];
  const lines = sqlContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comment-only lines
    if (trimmed.startsWith('--')) continue;

    // Check if previous line or current line has an override annotation
    const prevLine = i > 0 ? lines[i - 1].trim() : '';
    const hasOverride =
      line.includes('@migration-safe') ||
      prevLine.includes('@migration-safe') ||
      line.includes('safe-contract-phase') ||
      prevLine.includes('safe-contract-phase');

    if (hasOverride) continue;

    for (const rule of SAFETY_RULES) {
      if (rule.regex.test(line)) {
        issues.push({
          ruleId: rule.id,
          name: rule.name,
          severity: rule.severity,
          description: rule.description,
          file: filename,
          line: i + 1,
          snippet: trimmed,
        });
      }
    }
  }

  return issues;
}

/**
 * Main linter execution function.
 */
export function runLinter() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migrations directory not found at: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  let migrationDirs = [];

  if (isStagedOnly) {
    try {
      const gitOutput = execSync('git diff --name-only --cached', {
        encoding: 'utf8',
      });
      const stagedFiles = gitOutput.split('\n').filter(Boolean);
      const stagedMigrationDirs = stagedFiles
        .filter(
          (f) =>
            f.includes('prisma/migrations/') && f.endsWith('migration.sql'),
        )
        .map((f) => path.basename(path.dirname(f)));
      migrationDirs = [...new Set(stagedMigrationDirs)];
    } catch {
      console.warn(
        'Unable to inspect git staged files; falling back to full scan.',
      );
    }
  }

  if (migrationDirs.length === 0 && !isStagedOnly) {
    const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
    migrationDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  }

  if (targetMigration) {
    migrationDirs = migrationDirs.filter(
      (d) => d === targetMigration || d.includes(targetMigration),
    );
    if (migrationDirs.length === 0) {
      console.error(`Specified migration not found: ${targetMigration}`);
      process.exit(1);
    }
  }

  console.log(
    `\x1b[34m[Migration Safety Linter]\x1b[0m Scanning ${migrationDirs.length} migrations...`,
  );

  let activeErrors = 0;
  let activeWarnings = 0;
  let historicalIssues = 0;

  for (const dir of migrationDirs) {
    const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;

    const isHistorical = !isStrictAll && dir < HISTORICAL_BASELINE;
    const content = fs.readFileSync(sqlPath, 'utf8');
    const issues = analyzeMigrationSql(content, `${dir}/migration.sql`);

    for (const issue of issues) {
      if (isHistorical) {
        historicalIssues++;
        continue;
      }

      const isErr = issue.severity === 'ERROR';
      if (isErr) activeErrors++;
      else activeWarnings++;

      const color = isErr ? '\x1b[31m' : '\x1b[33m';
      console.log(
        `\n${color}[${issue.severity}]\x1b[0m ${issue.file}:${issue.line} — ${issue.name}`,
      );
      console.log(`  \x1b[90mSQL:\x1b[0m ${issue.snippet}`);
      console.log(`  \x1b[90mGuide:\x1b[0m ${issue.description}`);
    }
  }

  console.log('\n---');
  if (historicalIssues > 0) {
    console.log(
      `\x1b[90m[Advisory]\x1b[0m ${historicalIssues} historical migration patterns noted prior to Expand/Contract baseline (${HISTORICAL_BASELINE}).`,
    );
  }

  if (activeErrors > 0) {
    console.error(
      `\x1b[31mFAILED:\x1b[0m Found ${activeErrors} breaking migration issues (${activeWarnings} warnings).`,
    );
    console.error(
      'To permit deliberate Phase 3 contract migrations, annotate with `-- @migration-safe: <rationale>`.',
    );
    return false;
  }

  if (activeWarnings > 0) {
    console.log(
      `\x1b[33mPASSED with advisory warnings:\x1b[0m ${activeWarnings} Phase 3 contract changes detected. Non-breaking.`,
    );
    return true;
  }

  console.log(
    '\x1b[32mPASSED:\x1b[0m All audited migrations adhere to Expand/Contract backward-compatibility rules.',
  );
  return true;
}

// Execute when invoked directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const success = runLinter();
  process.exit(success ? 0 : 1);
}
