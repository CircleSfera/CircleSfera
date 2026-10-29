import { describe, expect, it } from 'vitest';
import {
  findProviderProduct,
  findStoredPlan,
  PLAN_CATALOG,
  type ProviderProduct,
  planUpdate,
  priceProblems,
  type StoredPlan,
} from './plan-catalog.ts';

const plan = (name: string) =>
  PLAN_CATALOG.find((candidate) => candidate.name === name)!;
const monthly = (amount: number, over: object = {}) => ({
  id: 'price_m',
  active: true,
  currency: 'eur',
  unit_amount: amount,
  tax_behavior: 'exclusive',
  recurring: { interval: 'month' },
  ...over,
});
const product = (over: Partial<ProviderProduct>): ProviderProduct => ({
  id: 'prod_1',
  name: 'Premium',
  active: true,
  metadata: {},
  default_price: monthly(999),
  ...over,
});
const stored = (over: Partial<StoredPlan>): StoredPlan => ({
  id: 'plan_1',
  name: 'Premium',
  priceCents: 999,
  description: 'Verified badge and priority support.',
  features: ['verified_badge', 'priority_support'],
  currency: 'EUR',
  interval: 'month',
  stripeProductId: 'prod_1',
  stripePriceId: 'price_m',
  yearlyStripePriceId: null,
  isActive: true,
  ...over,
});

describe('the plan catalog', () => {
  it('sells Verified with the badge only, apart from Premium', () => {
    expect(plan('Verified')).toMatchObject({
      priceCents: 499,
      features: ['verified_badge'],
    });
    expect(plan('Premium')).toMatchObject({
      priceCents: 999,
      features: ['verified_badge', 'priority_support'],
    });
    expect(PLAN_CATALOG.map((p) => p.priceCents)).toEqual([
      499, 999, 1999, 4999,
    ]);
  });
});

describe('findProviderProduct', () => {
  it('prefers the product labelled with the plan over one with its name', () => {
    const labelled = product({
      id: 'prod_label',
      name: 'Premium (2026)',
      metadata: { circlesfera_plan: 'Premium' },
    });
    const named = product({ id: 'prod_named' });

    expect(
      findProviderProduct([named, labelled], plan('Premium')).product,
    ).toBe(labelled);
  });

  it('finds the product by its exact name, and never an archived one', () => {
    expect(
      findProviderProduct(
        [
          product({ id: 'prod_old', active: false }),
          product({ id: 'prod_new' }),
          product({ id: 'prod_badge', name: 'Verified Badge' }),
        ],
        plan('Premium'),
      ).product?.id,
    ).toBe('prod_new');
    expect(
      findProviderProduct(
        [product({ name: 'Verified Badge' })],
        plan('Verified'),
      ),
    ).toEqual({ problem: 'Verified: no active product in the provider' });
  });

  it('refuses to guess between two products', () => {
    expect(
      findProviderProduct(
        [product({ id: 'prod_a' }), product({ id: 'prod_b' })],
        plan('Premium'),
      ).problem,
    ).toBe('Premium: 2 active products match (prod_a, prod_b)');
  });
});

describe('priceProblems', () => {
  it('accepts the monthly price in euros, before VAT', () => {
    expect(priceProblems(monthly(999), plan('Premium'))).toEqual([]);
  });

  it('names everything wrong with the default price', () => {
    expect(
      priceProblems(
        monthly(1000, {
          active: false,
          currency: 'usd',
          tax_behavior: 'unspecified',
          recurring: { interval: 'year' },
        }),
        plan('Premium'),
      ),
    ).toEqual([
      'Premium: the default price it is archived',
      'Premium: the default price it is not monthly',
      'Premium: the default price it is in usd',
      'Premium: the default price it is 1000 cents, not 999',
      'Premium: the default price its VAT is unspecified, not exclusive',
    ]);
    expect(priceProblems(null, plan('Premium'))).toEqual([
      'Premium: the product has no default price',
    ]);
    expect(priceProblems('price_m', plan('Premium'))).toHaveLength(1);
  });
});

describe('findStoredPlan', () => {
  it('finds the stored plan by its product first', () => {
    const row = stored({ name: 'Old name', stripeProductId: 'prod_1' });
    expect(findStoredPlan([row], plan('Premium'), 'prod_1')).toBe(row);
  });

  it('finds it by name and price in a database of another environment', () => {
    const row = stored({ stripeProductId: 'prod_live' });
    expect(findStoredPlan([row], plan('Premium'), 'prod_test')).toBe(row);
  });

  it('takes the €9.99 plan once named Verified as Premium, never as the new Verified', () => {
    const formerPremium = stored({
      name: 'Verified',
      stripeProductId: 'prod_live',
    });

    expect(findStoredPlan([formerPremium], plan('Premium'), 'prod_test')).toBe(
      formerPremium,
    );
    expect(
      findStoredPlan([formerPremium], plan('Verified'), 'prod_verified'),
    ).toBeUndefined();
  });
});

describe('planUpdate', () => {
  it('changes nothing in a plan already as the catalog says', () => {
    expect(
      planUpdate(stored({}), plan('Premium'), 'prod_1', 'price_m', ['price_m']),
    ).toBeNull();
  });

  it("sets the environment's own product and price, and only what differs", () => {
    expect(
      planUpdate(
        stored({
          name: 'Verified',
          stripeProductId: 'prod_live',
          stripePriceId: 'price_live',
        }),
        plan('Premium'),
        'prod_test',
        'price_test',
        ['price_test'],
      ),
    ).toEqual({
      name: 'Premium',
      stripeProductId: 'prod_test',
      stripePriceId: 'price_test',
    });
  });

  it('clears a yearly price that is not one of the product', () => {
    expect(
      planUpdate(
        stored({ yearlyStripePriceId: 'price_year_live' }),
        plan('Premium'),
        'prod_1',
        'price_m',
        ['price_m'],
      ),
    ).toEqual({ yearlyStripePriceId: null, yearlyPriceCents: null });
    expect(
      planUpdate(
        stored({ yearlyStripePriceId: 'price_year' }),
        plan('Premium'),
        'prod_1',
        'price_m',
        ['price_m', 'price_year'],
      ),
    ).toBeNull();
  });

  it('adds a plan the database lacks, whole', () => {
    expect(
      planUpdate(undefined, plan('Verified'), 'prod_v', 'price_v', ['price_v']),
    ).toEqual({
      name: 'Verified',
      description: 'Verified badge.',
      features: ['verified_badge'],
      priceCents: 499,
      currency: 'EUR',
      interval: 'month',
      stripeProductId: 'prod_v',
      stripePriceId: 'price_v',
      isActive: true,
    });
  });

  it('turns on a plan switched off, and sets features that differ', () => {
    expect(
      planUpdate(
        stored({ isActive: false, features: ['verified_badge'] }),
        plan('Premium'),
        'prod_1',
        'price_m',
        ['price_m'],
      ),
    ).toEqual({
      features: ['verified_badge', 'priority_support'],
      isActive: true,
    });
  });
});
