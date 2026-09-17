import { describe, expect, it } from 'vitest';
import {
  BACKUP_RETENTION_POLICY,
  DISASTER_RECOVERY_SLA,
  getBackupStoragePaths,
  isBackupStale,
  RESTORE_DRILL_POLICY,
} from './disaster-recovery.constants.js';

describe('Disaster Recovery Constants & SLAs', () => {
  describe('DISASTER_RECOVERY_SLA', () => {
    it('defines explicit PostgreSQL RPO and RTO within SLA targets', () => {
      expect(DISASTER_RECOVERY_SLA.POSTGRES_RPO_HOURS).toBeLessThanOrEqual(24);
      expect(DISASTER_RECOVERY_SLA.POSTGRES_RTO_MINUTES).toBeLessThanOrEqual(
        30,
      );
    });

    it('enforces financial ledger RPO of 0 seconds', () => {
      expect(DISASTER_RECOVERY_SLA.FINANCIAL_LEDGER_RPO_SECONDS).toBe(0);
      expect(
        DISASTER_RECOVERY_SLA.FINANCIAL_LEDGER_RTO_MINUTES,
      ).toBeLessThanOrEqual(30);
    });

    it('defines media uploads and redis cache boundaries', () => {
      expect(DISASTER_RECOVERY_SLA.UPLOADS_RPO_HOURS).toBeLessThanOrEqual(24);
      expect(DISASTER_RECOVERY_SLA.UPLOADS_RTO_MINUTES).toBeLessThanOrEqual(45);
      expect(DISASTER_RECOVERY_SLA.REDIS_CACHE_RPO_MINUTES).toBeLessThanOrEqual(
        15,
      );
      expect(DISASTER_RECOVERY_SLA.REDIS_CACHE_RTO_MINUTES).toBeLessThanOrEqual(
        5,
      );
    });
  });

  describe('BACKUP_RETENTION_POLICY', () => {
    it('enforces at least 30 days local and 90 days off-host retention', () => {
      expect(BACKUP_RETENTION_POLICY.LOCAL_DAYS).toBeGreaterThanOrEqual(30);
      expect(BACKUP_RETENTION_POLICY.OFF_HOST_DAYS).toBeGreaterThanOrEqual(90);
    });

    it('has a 26 hour max staleness threshold (daily cron + 2h margin)', () => {
      expect(BACKUP_RETENTION_POLICY.MAX_BACKUP_STALENESS_HOURS).toBe(26);
      expect(BACKUP_RETENTION_POLICY.CRON_SCHEDULE_UTC).toBe('0 2 * * *');
    });
  });

  describe('RESTORE_DRILL_POLICY', () => {
    it('specifies automated and manual drill cadences', () => {
      expect(RESTORE_DRILL_POLICY.AUTOMATED_CADENCE_DAYS).toBe(7);
      expect(RESTORE_DRILL_POLICY.MANUAL_GAME_DAY_CADENCE_DAYS).toBe(90);
      expect(RESTORE_DRILL_POLICY.DEFAULT_TEST_DATABASE_NAME).toBe(
        'CircleSfera_restore_test',
      );
      expect(RESTORE_DRILL_POLICY.MIN_VALID_DUMP_BYTES).toBe(500);
      expect(RESTORE_DRILL_POLICY.MIN_VALID_TOC_ENTRIES).toBe(5);
    });
  });

  describe('isBackupStale', () => {
    it('returns false when backup was performed within staleness threshold', () => {
      const now = new Date('2026-09-17T12:00:00Z');
      const backupDate = new Date('2026-09-17T02:00:00Z'); // 10h ago
      expect(isBackupStale(backupDate, 26, now)).toBe(false);
    });

    it('returns true when backup exceeds staleness threshold', () => {
      const now = new Date('2026-09-17T12:00:00Z');
      const backupDate = new Date('2026-09-16T08:00:00Z'); // 28h ago
      expect(isBackupStale(backupDate, 26, now)).toBe(true);
    });

    it('uses default 26h threshold when omitted', () => {
      const now = new Date('2026-09-17T12:00:00Z');
      const freshBackup = new Date('2026-09-16T14:00:00Z'); // 22h ago
      const staleBackup = new Date('2026-09-16T09:00:00Z'); // 27h ago
      expect(isBackupStale(freshBackup, undefined, now)).toBe(false);
      expect(isBackupStale(staleBackup, undefined, now)).toBe(true);
    });
  });

  describe('getBackupStoragePaths', () => {
    it('generates canonical S3 key paths matching backup scripts', () => {
      const timestamp = '20260917_020000';
      const paths = getBackupStoragePaths(timestamp);
      expect(paths.postgresDumpKey).toBe(
        'postgres/full/pg_backup_20260917_020000.dump',
      );
      expect(paths.uploadsArchiveKey).toBe(
        'uploads/uploads_backup_20260917_020000.tar.gz',
      );
    });
  });
});
