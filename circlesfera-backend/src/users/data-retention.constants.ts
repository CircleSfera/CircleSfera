/**
 * Financial and legal data retention policy for CircleSfera.
 *
 * Each record class is assigned a retention window and a disposal method.
 * This file is the single authoritative reference for lifecycle decisions
 * made during account deletion, maintenance jobs, and audit tooling.
 *
 * Retention classes:
 *  - FINANCIAL_AUDIT  : Records required for fiscal/legal compliance (≥ 7 years).
 *                       Rows survive user hard-deletion; the userId FK is set to NULL
 *                       (onDelete: SetNull). A maintenance job prunes them after the
 *                       retention window expires.
 *  - OPERATIONAL      : Records that serve product features only. No retention obligation
 *                       beyond product necessity. Deleted via CASCADE when the owning
 *                       user is hard-deleted.
 *  - SOCIAL_CONTENT   : User-generated content on Profile. Deleted on hard-deletion;
 *                       platform moderation logs may be retained separately.
 */

export type RetentionClass =
  | 'FINANCIAL_AUDIT'
  | 'OPERATIONAL'
  | 'SOCIAL_CONTENT';
export type DisposalMethod =
  | 'SET_NULL_ON_USER_DELETE'
  | 'CASCADE_DELETE'
  | 'ANONYMIZE';

export interface RetentionPolicy {
  /** Human-readable label for the record class. */
  label: string;
  /** Prisma model / database table identifier. */
  model: string;
  /** Retention class governing the lifecycle decision. */
  retentionClass: RetentionClass;
  /** Minimum number of days the record must be retained after creation. */
  retentionDays: number;
  /** How the record is disposed when user account is hard-deleted. */
  disposalMethod: DisposalMethod;
  /** Authoritative reference for the retention requirement. */
  rationale: string;
}

/**
 * Canonical retention policy for every persisted financial/legal record class.
 *
 * IMPORTANT: Any change to this map must be reviewed by the platform operator
 * and reflected in the data-processing addendum (DPA) with payment providers.
 */
export const DATA_RETENTION_POLICY = {
  /**
   * Monetary transactions (tips, unlocks, live gifts, promotions).
   * onDelete: SetNull — row survives; senderId/receiverId become NULL.
   * Schema already compliant.
   */
  Transaction: {
    label: 'Monetary Transaction',
    model: 'Transaction',
    retentionClass: 'FINANCIAL_AUDIT',
    retentionDays: 7 * 365, // 7 years
    disposalMethod: 'SET_NULL_ON_USER_DELETE',
    rationale:
      'Payment records required for tax authority reporting, VAT reconciliation, and potential dispute evidence.',
  },

  /**
   * Stripe Connect payout ledger entries.
   * Changed to onDelete: SetNull (migration 20260916220736).
   */
  StripePayoutLog: {
    label: 'Stripe Payout Log',
    model: 'StripePayoutLog',
    retentionClass: 'FINANCIAL_AUDIT',
    retentionDays: 7 * 365, // 7 years
    disposalMethod: 'SET_NULL_ON_USER_DELETE',
    rationale:
      'Payout records required for creator earnings audit trail and Stripe Connect reconciliation.',
  },

  /**
   * Live-stream gift payment records (Stripe Checkout + Connect destination charge).
   * Changed to onDelete: SetNull (migration 20260925184359).
   */
  LiveGift: {
    label: 'Live Gift Payment',
    model: 'LiveGift',
    retentionClass: 'FINANCIAL_AUDIT',
    retentionDays: 7 * 365, // 7 years
    disposalMethod: 'SET_NULL_ON_USER_DELETE',
    rationale:
      'Live-gift payment records required for creator earnings audit trail and Stripe Connect reconciliation, independent of either party (sender or receiver) later deleting their account.',
  },

  /**
   * Platform subscription records tied to Stripe subscriptions.
   * Changed to onDelete: SetNull (migration 20260916220736).
   */
  PlatformSubscription: {
    label: 'Platform Subscription',
    model: 'PlatformSubscription',
    retentionClass: 'FINANCIAL_AUDIT',
    retentionDays: 7 * 365, // 7 years
    disposalMethod: 'SET_NULL_ON_USER_DELETE',
    rationale:
      'Subscription billing records required for refund processing, chargeback defence, and fiscal audit.',
  },

  /**
   * Monetization ledger (lifetime earnings, Stripe status cache).
   * Operational aggregate — not a primary financial record.
   * Cascade-deleted: Stripe is the authoritative source for earnings.
   */
  Monetization: {
    label: 'Creator Monetization Ledger',
    model: 'Monetization',
    retentionClass: 'OPERATIONAL',
    retentionDays: 0,
    disposalMethod: 'CASCADE_DELETE',
    rationale:
      'Operational cache of Stripe data. Stripe Connect account serves as authoritative source. Cascade-delete is acceptable.',
  },

  /**
   * Ad promotions (paid campaign metadata and budget ledger).
   * Budget already settled in Stripe at campaign closure.
   * Cascade-deleted: no independent audit obligation post-settlement.
   */
  Promotion: {
    label: 'Advertising Promotion',
    model: 'Promotion',
    retentionClass: 'OPERATIONAL',
    retentionDays: 0,
    disposalMethod: 'CASCADE_DELETE',
    rationale:
      'Promotion budget settled via Stripe PaymentIntent. No independent retention obligation after settlement. Cascade-delete is acceptable.',
  },

  /**
   * Completed GDPR data export requests.
   * Retained for 7 days (export expiry window), then pruned by maintenance job.
   */
  DataExportRequest: {
    label: 'GDPR Data Export Request',
    model: 'DataExportRequest',
    retentionClass: 'OPERATIONAL',
    retentionDays: 7,
    disposalMethod: 'CASCADE_DELETE',
    rationale:
      'GDPR compliance record. Export file is served for 7 days, then purged by the clean-expired-data-exports cron.',
  },
} as const satisfies Record<string, RetentionPolicy>;

/**
 * Returns all record classes that have a FINANCIAL_AUDIT retention class.
 * Used by account deletion logging and future maintenance pruning jobs.
 */
export function getFinancialAuditRecords(): RetentionPolicy[] {
  return Object.values(DATA_RETENTION_POLICY).filter(
    (p) => p.retentionClass === 'FINANCIAL_AUDIT',
  );
}
