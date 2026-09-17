/**
 * Disaster Recovery and Backup Policy Constants
 *
 * Defines explicit RPO/RTO SLAs, retention schedules, staleness thresholds,
 * and drill verification standards for the CircleSfera infrastructure.
 */

export const DISASTER_RECOVERY_SLA = {
  /**
   * PostgreSQL relational core (Prisma).
   * Daily logical dumps with off-host replication.
   */
  POSTGRES_RPO_HOURS: 24,
  POSTGRES_RTO_MINUTES: 30,

  /**
   * Financial transactions & wallet ledgers.
   * RPO = 0 through transactional ACID guarantees and Stripe webhook replayability.
   */
  FINANCIAL_LEDGER_RPO_SECONDS: 0,
  FINANCIAL_LEDGER_RTO_MINUTES: 30,

  /**
   * Media uploads archive (S3 / volume storage).
   * Daily archive snapshot.
   */
  UPLOADS_RPO_HOURS: 24,
  UPLOADS_RTO_MINUTES: 45,

  /**
   * Redis / BullMQ / in-memory state.
   * State is ephemeral or rebuildable from DB.
   */
  REDIS_CACHE_RPO_MINUTES: 15,
  REDIS_CACHE_RTO_MINUTES: 5,
} as const;

export const BACKUP_RETENTION_POLICY = {
  /** Local retention in days on the VPS host. */
  LOCAL_DAYS: 30,

  /** Remote off-host S3 retention in days. */
  OFF_HOST_DAYS: 90,

  /**
   * Maximum acceptable time between successful backups before triggering an alert.
   * 24h cron schedule + 2h margin for execution and jitter.
   */
  MAX_BACKUP_STALENESS_HOURS: 26,

  /** Daily UTC cron schedule string for backup jobs (02:00 UTC). */
  CRON_SCHEDULE_UTC: '0 2 * * *',
} as const;

export const RESTORE_DRILL_POLICY = {
  /** Automated drill cadence in days (weekly). */
  AUTOMATED_CADENCE_DAYS: 7,

  /** Manual full cold recovery simulation (Game Day) cadence in days (quarterly). */
  MANUAL_GAME_DAY_CADENCE_DAYS: 90,

  /** Canonical name of the ephemeral isolated test database used in drills. */
  DEFAULT_TEST_DATABASE_NAME: 'CircleSfera_restore_test',

  /** Minimum acceptable dump file size in bytes to prevent blank dump corruption. */
  MIN_VALID_DUMP_BYTES: 500,

  /** Minimum table of contents entries for a healthy pg_restore --list output. */
  MIN_VALID_TOC_ENTRIES: 5,
} as const;

/**
 * Checks if a backup timestamp has exceeded the maximum staleness SLA.
 */
export function isBackupStale(
  lastBackupDate: Date,
  maxStalenessHours: number = BACKUP_RETENTION_POLICY.MAX_BACKUP_STALENESS_HOURS,
  currentDate: Date = new Date(),
): boolean {
  const elapsedMs = currentDate.getTime() - lastBackupDate.getTime();
  const maxAllowedMs = maxStalenessHours * 60 * 60 * 1000;
  return elapsedMs > maxAllowedMs;
}

/**
 * Returns canonical S3 storage key paths for backups given a timestamp.
 */
export function getBackupStoragePaths(timestamp: string): {
  postgresDumpKey: string;
  uploadsArchiveKey: string;
} {
  return {
    postgresDumpKey: `postgres/full/pg_backup_${timestamp}.dump`,
    uploadsArchiveKey: `uploads/uploads_backup_${timestamp}.tar.gz`,
  };
}
