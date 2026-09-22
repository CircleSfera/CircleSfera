/**
 * Migration Safety & Expand/Contract Utilities
 *
 * Defines analysis rules and helper functions to detect breaking database
 * migration statements and enforce backward-compatibility with N-1 application code.
 */

export interface MigrationSafetyRule {
  id: string;
  name: string;
  regex: RegExp;
  severity: 'WARNING' | 'ERROR';
  description: string;
}

export interface MigrationSafetyIssue {
  ruleId: string;
  name: string;
  severity: 'WARNING' | 'ERROR';
  description: string;
  file: string;
  line: number;
  snippet: string;
}

export const SAFETY_RULES: MigrationSafetyRule[] = [
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
export function analyzeMigrationSql(
  sqlContent: string,
  filename = 'migration.sql',
): MigrationSafetyIssue[] {
  const issues: MigrationSafetyIssue[] = [];
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
