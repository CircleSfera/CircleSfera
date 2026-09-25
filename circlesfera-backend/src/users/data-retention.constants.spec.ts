import { describe, expect, it } from 'vitest';
import {
  DATA_RETENTION_POLICY,
  getFinancialAuditRecords,
} from './data-retention.constants.js';

describe('DATA_RETENTION_POLICY', () => {
  it('defines a policy for every expected record class', () => {
    const expectedModels = [
      'Transaction',
      'StripePayoutLog',
      'LiveGift',
      'PlatformSubscription',
      'Monetization',
      'Promotion',
      'DataExportRequest',
    ];
    for (const model of expectedModels) {
      expect(DATA_RETENTION_POLICY).toHaveProperty(model);
    }
  });

  it('assigns FINANCIAL_AUDIT class to Transaction, StripePayoutLog, LiveGift and PlatformSubscription', () => {
    expect(DATA_RETENTION_POLICY.Transaction.retentionClass).toBe(
      'FINANCIAL_AUDIT',
    );
    expect(DATA_RETENTION_POLICY.StripePayoutLog.retentionClass).toBe(
      'FINANCIAL_AUDIT',
    );
    expect(DATA_RETENTION_POLICY.LiveGift.retentionClass).toBe(
      'FINANCIAL_AUDIT',
    );
    expect(DATA_RETENTION_POLICY.PlatformSubscription.retentionClass).toBe(
      'FINANCIAL_AUDIT',
    );
  });

  it('sets at least 7-year retention (2555 days) for all FINANCIAL_AUDIT records', () => {
    const SEVEN_YEARS = 7 * 365;
    for (const policy of Object.values(DATA_RETENTION_POLICY)) {
      if (policy.retentionClass === 'FINANCIAL_AUDIT') {
        expect(policy.retentionDays).toBeGreaterThanOrEqual(SEVEN_YEARS);
      }
    }
  });

  it('assigns SET_NULL_ON_USER_DELETE disposal to all FINANCIAL_AUDIT records', () => {
    for (const policy of Object.values(DATA_RETENTION_POLICY)) {
      if (policy.retentionClass === 'FINANCIAL_AUDIT') {
        expect(policy.disposalMethod).toBe('SET_NULL_ON_USER_DELETE');
      }
    }
  });

  it('assigns OPERATIONAL class to Monetization, Promotion and DataExportRequest', () => {
    expect(DATA_RETENTION_POLICY.Monetization.retentionClass).toBe(
      'OPERATIONAL',
    );
    expect(DATA_RETENTION_POLICY.Promotion.retentionClass).toBe('OPERATIONAL');
    expect(DATA_RETENTION_POLICY.DataExportRequest.retentionClass).toBe(
      'OPERATIONAL',
    );
  });

  it('sets CASCADE_DELETE disposal for OPERATIONAL records', () => {
    expect(DATA_RETENTION_POLICY.Monetization.disposalMethod).toBe(
      'CASCADE_DELETE',
    );
    expect(DATA_RETENTION_POLICY.Promotion.disposalMethod).toBe(
      'CASCADE_DELETE',
    );
    expect(DATA_RETENTION_POLICY.DataExportRequest.disposalMethod).toBe(
      'CASCADE_DELETE',
    );
  });

  it('every policy entry has a non-empty label, model, and rationale', () => {
    for (const policy of Object.values(DATA_RETENTION_POLICY)) {
      expect(policy.label.length).toBeGreaterThan(0);
      expect(policy.model.length).toBeGreaterThan(0);
      expect(policy.rationale.length).toBeGreaterThan(0);
    }
  });
});

describe('getFinancialAuditRecords', () => {
  it('returns only FINANCIAL_AUDIT records', () => {
    const records = getFinancialAuditRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.retentionClass).toBe('FINANCIAL_AUDIT');
    }
  });

  it('includes Transaction, StripePayoutLog, LiveGift and PlatformSubscription', () => {
    const models = getFinancialAuditRecords().map((r) => r.model);
    expect(models).toContain('Transaction');
    expect(models).toContain('StripePayoutLog');
    expect(models).toContain('LiveGift');
    expect(models).toContain('PlatformSubscription');
  });

  it('does not include OPERATIONAL records', () => {
    const models = getFinancialAuditRecords().map((r) => r.model);
    expect(models).not.toContain('Monetization');
    expect(models).not.toContain('Promotion');
    expect(models).not.toContain('DataExportRequest');
  });
});
