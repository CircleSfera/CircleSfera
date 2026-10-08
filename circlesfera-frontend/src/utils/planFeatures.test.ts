import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';
import { createTestI18n } from '../test/test-utils';
import { planFeatureLabel } from './planFeatures';

describe('planFeatureLabel', () => {
  it('names a known feature in the reader language', () => {
    expect(planFeatureLabel('multi_account', createTestI18n('en').t)).toBe(
      'Multiple accounts',
    );
    expect(planFeatureLabel('multi_account', createTestI18n('es').t)).toBe(
      'Varias cuentas',
    );
  });

  it('writes a feature it has no text for as plain words', () => {
    expect(planFeatureLabel('early_access', createTestI18n('en').t)).toBe(
      'early access',
    );
  });

  it('both languages name the same features', () => {
    expect(Object.keys(es.pricingPage.features).sort()).toEqual(
      Object.keys(en.pricingPage.features).sort(),
    );
    expect(Object.keys(es.creator.income.tx_types).sort()).toEqual(
      Object.keys(en.creator.income.tx_types).sort(),
    );
  });
});
