import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeMigrationSql, SAFETY_RULES } from './migration-safety.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../');
const MIGRATIONS_DIR = path.join(
  ROOT_DIR,
  'circlesfera-backend',
  'prisma',
  'migrations',
);

describe('Migration Safety & Expand/Contract Verification', () => {
  describe('Rule Definitions', () => {
    it('defines rules for DROP COLUMN, DROP TABLE, RENAME COLUMN, and ADD NOT NULL NO DEFAULT', () => {
      const ruleIds = SAFETY_RULES.map((r) => r.id);
      expect(ruleIds).toContain('DROP_COLUMN');
      expect(ruleIds).toContain('DROP_TABLE');
      expect(ruleIds).toContain('RENAME_COLUMN');
      expect(ruleIds).toContain('ADD_NOT_NULL_NO_DEFAULT');
    });
  });

  describe('analyzeMigrationSql', () => {
    it('flags unannotated DROP COLUMN statement', () => {
      const sql = 'ALTER TABLE "users" DROP COLUMN "legacy_field";';
      const issues = analyzeMigrationSql(sql);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe('DROP_COLUMN');
      expect(issues[0].severity).toBe('WARNING');
    });

    it('flags direct RENAME COLUMN statement as an error', () => {
      const sql = 'ALTER TABLE "posts" RENAME COLUMN "old_name" TO "new_name";';
      const issues = analyzeMigrationSql(sql);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe('RENAME_COLUMN');
      expect(issues[0].severity).toBe('ERROR');
    });

    it('flags ADD COLUMN NOT NULL without DEFAULT as an error', () => {
      const sql =
        'ALTER TABLE "comments" ADD COLUMN "content_type" TEXT NOT NULL;';
      const issues = analyzeMigrationSql(sql);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe('ADD_NOT_NULL_NO_DEFAULT');
      expect(issues[0].severity).toBe('ERROR');
    });

    it('permits ADD COLUMN NOT NULL when a DEFAULT is supplied', () => {
      const sql =
        'ALTER TABLE "comments" ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false;';
      const issues = analyzeMigrationSql(sql);
      expect(issues).toHaveLength(0);
    });

    it('permits ADD COLUMN when nullable', () => {
      const sql = 'ALTER TABLE "users" ADD COLUMN "phone_number" TEXT;';
      const issues = analyzeMigrationSql(sql);
      expect(issues).toHaveLength(0);
    });

    it('honors in-line @migration-safe override comments', () => {
      const sql = `
-- @migration-safe: Phase 3 contract drop after verifying no consumers
ALTER TABLE "users" DROP COLUMN "old_token";
      `;
      const issues = analyzeMigrationSql(sql);
      expect(issues).toHaveLength(0);
    });
  });

  describe('Latest Migration & Reversibility', () => {
    const latestMigrationDir = path.join(
      MIGRATIONS_DIR,
      '20260916220736_financial_records_set_null_on_user_delete',
    );

    it('has an existing migration.sql without unannotated breaking errors', () => {
      const forwardSqlPath = path.join(latestMigrationDir, 'migration.sql');
      expect(fs.existsSync(forwardSqlPath)).toBe(true);

      const forwardSql = fs.readFileSync(forwardSqlPath, 'utf8');
      const issues = analyzeMigrationSql(forwardSql);
      const errors = issues.filter((i) => i.severity === 'ERROR');
      expect(errors).toHaveLength(0);
    });

    it('has a valid accompanying down.sql rollback script', () => {
      const downSqlPath = path.join(latestMigrationDir, 'down.sql');
      expect(fs.existsSync(downSqlPath)).toBe(true);

      const downSql = fs.readFileSync(downSqlPath, 'utf8');
      expect(downSql).toContain('ALTER TABLE "stripe_payout_logs"');
      expect(downSql).toContain('ALTER TABLE "platform_subscriptions"');
      expect(downSql).toContain('ON DELETE CASCADE');
    });
  });
});
