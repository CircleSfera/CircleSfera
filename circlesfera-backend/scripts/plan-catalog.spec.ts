import { describe, expect, it } from 'vitest';
import {
  findProviderProduct,
  findStoredPlan,
  PLAN_CATALOG,
  type ProviderPrice,
  type ProviderProduct,
  planPrice,
  planUpdate,
  planYearlyPrice,
  priceProblems,
  type StoredPlan,
  staleProductDescription,
} from './plan-catalog.ts';

// The add-on's name in the catalog; the server knows it by its addOn mark.
const STUDIO_PRO_PLAN_NAME = 'Edits Studio Pro';

const plan = (name: string) =>
  PLAN_CATALOG.find((candidate) => candidate.name === name)!;
const monthly = (amount: number, over: object = {}) => ({
  id: 'price_m',
  active: true,
  currency: 'eur',
  unit_amount: amount,
  tax_behavior: 'inclusive',
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
  yearlyPriceCents: null,
  isActive: true,
  badge: 'VERIFIED',
  forAccountType: null,
  addOn: false,
  ...over,
});
const yearly = (amount: number, over: object = {}) =>
  monthly(amount, { id: 'price_y', recurring: { interval: 'year' }, ...over });

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
      499, 999, 1999, 4999, 799,
    ]);
  });

  it('sells Edits Studio Pro as the add-on, marked so, and gives it with Elite Creator and Business only', () => {
    expect(plan(STUDIO_PRO_PLAN_NAME)).toMatchObject({
      priceCents: 799,
      features: ['studio_pro'],
      addOn: true,
    });
    // The only add-on.
    expect(PLAN_CATALOG.filter((p) => p.addOn).map((p) => p.name)).toEqual([
      STUDIO_PRO_PLAN_NAME,
    ]);
    expect(
      PLAN_CATALOG.filter((p) => p.features.includes('studio_pro')).map(
        (p) => p.name,
      ),
    ).toEqual(['Elite Creator', 'Business', STUDIO_PRO_PLAN_NAME]);
    // The add-on never gives the badge: the badge follows the plan.
    expect(plan(STUDIO_PRO_PLAN_NAME).features).not.toContain('verified_badge');
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

describe('planPrice', () => {
  const product = (default_price: ProviderPrice | null) =>
    ({
      id: 'prod_1',
      name: 'Premium',
      active: true,
      metadata: {},
      default_price,
    }) as ProviderProduct;

  it("is the product's default price when it has one", () => {
    const chosen = monthly(999);
    expect(planPrice(product(chosen), [monthly(999, { id: 'other' })])).toBe(
      chosen,
    );
  });

  it('is the one monthly price in euros of a product with no default', () => {
    const only = monthly(999, { id: 'only' });
    expect(
      planPrice(product(null), [
        only,
        monthly(9990, { id: 'yearly', recurring: { interval: 'year' } }),
      ]),
    ).toBe(only);
  });

  it('is none when a product with no default has several monthly prices', () => {
    expect(
      planPrice(product(null), [
        monthly(999, { id: 'a' }),
        monthly(1099, { id: 'b' }),
      ]),
    ).toBeNull();
  });
});

describe('priceProblems', () => {
  it('accepts the monthly price in euros, VAT included', () => {
    expect(priceProblems(monthly(999), plan('Premium'))).toEqual([]);
  });

  it.each(['inferred_by_currency', 'inclusive'])(
    'accepts a price in euros that leaves VAT to an account whose default is %s',
    (accountDefault) => {
      expect(
        priceProblems(
          monthly(999, { tax_behavior: 'unspecified' }),
          plan('Premium'),
          accountDefault,
        ),
      ).toEqual([]);
    },
  );

  it.each([['exclusive'], [null]])(
    'refuses a price that leaves VAT to an account whose default is %s',
    (accountDefault) => {
      expect(
        priceProblems(
          monthly(999, { tax_behavior: 'unspecified' }),
          plan('Premium'),
          accountDefault,
        ),
      ).toEqual([
        'Premium: the default price its VAT is unspecified, not inclusive',
      ]);
    },
  );

  it('refuses a price that adds VAT on top', () => {
    expect(
      priceProblems(
        monthly(999, { tax_behavior: 'exclusive' }),
        plan('Premium'),
      ),
    ).toEqual([
      'Premium: the default price its VAT is exclusive, not inclusive',
    ]);
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
      'Premium: the default price its VAT is unspecified, not inclusive',
    ]);
    expect(priceProblems(null, plan('Premium'))).toEqual([
      'Premium: the product has no default price, nor a single monthly price in euros',
    ]);
    expect(priceProblems('price_m', plan('Premium'))).toHaveLength(1);
  });
});

describe('planYearlyPrice', () => {
  it('sells every plan by the year too (BD-016), and the add-on monthly only', () => {
    expect(
      PLAN_CATALOG.map((p) => [p.name, p.yearlyPriceCents ?? null]),
    ).toEqual([
      ['Verified', 4990],
      ['Premium', 9990],
      ['Elite Creator', 19990],
      ['Business', 49990],
      [STUDIO_PRO_PLAN_NAME, null],
    ]);
  });

  it('is the one active yearly price in euros at the yearly amount, VAT included', () => {
    const price = yearly(9990);
    expect(planYearlyPrice([monthly(999), price], plan('Premium'))).toEqual({
      price,
    });
  });

  it('is none, with a notice, while the provider has no such price', () => {
    for (const prices of [
      [monthly(999)],
      [yearly(9900)],
      [yearly(9990, { currency: 'usd' })],
      [yearly(9990, { tax_behavior: 'exclusive' })],
      [yearly(9990, { active: false })],
      [yearly(9990, { recurring: { interval: 'year', interval_count: 2 } })],
    ]) {
      expect(planYearlyPrice(prices, plan('Premium'))).toEqual({
        notice:
          'Premium: no active yearly price of 9990 cents in euros, VAT included; sold monthly only',
      });
    }
  });

  it('is none when several prices match: which one is meant is not guessed', () => {
    expect(
      planYearlyPrice(
        [yearly(9990, { id: 'a' }), yearly(9990, { id: 'b' })],
        plan('Premium'),
      ).notice,
    ).toBe('Premium: 2 yearly prices match (a, b); sold monthly only');
  });

  it('is nothing for what is not sold by the year, as the add-on', () => {
    expect(planYearlyPrice([yearly(7990)], plan(STUDIO_PRO_PLAN_NAME))).toEqual(
      {},
    );
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
      planUpdate(stored({}), plan('Premium'), 'prod_1', 'price_m', null),
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
        null,
      ),
    ).toEqual({
      name: 'Premium',
      stripeProductId: 'prod_test',
      stripePriceId: 'price_test',
    });
  });

  it('sets the yearly price found, and clears one no longer found', () => {
    expect(
      planUpdate(stored({}), plan('Premium'), 'prod_1', 'price_m', {
        id: 'price_y',
        cents: 9990,
      }),
    ).toEqual({ yearlyStripePriceId: 'price_y', yearlyPriceCents: 9990 });
    expect(
      planUpdate(
        stored({
          yearlyStripePriceId: 'price_year_live',
          yearlyPriceCents: 9990,
        }),
        plan('Premium'),
        'prod_1',
        'price_m',
        null,
      ),
    ).toEqual({ yearlyStripePriceId: null, yearlyPriceCents: null });
    expect(
      planUpdate(
        stored({ yearlyStripePriceId: 'price_y', yearlyPriceCents: 9990 }),
        plan('Premium'),
        'prod_1',
        'price_m',
        { id: 'price_y', cents: 9990 },
      ),
    ).toBeNull();
  });

  it('adds a plan the database lacks, whole', () => {
    expect(
      planUpdate(undefined, plan('Verified'), 'prod_v', 'price_v', null),
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
      yearlyStripePriceId: null,
      yearlyPriceCents: null,
      badge: 'VERIFIED',
      forAccountType: null,
      addOn: false,
    });
  });

  it('sets what a plan gives and to whom from the catalog, never from its name', () => {
    expect(
      planUpdate(
        stored({ name: 'Business', badge: 'BASIC', forAccountType: null }),
        plan('Business'),
        'prod_1',
        'price_m',
        null,
      ),
    ).toMatchObject({ badge: 'BUSINESS', forAccountType: 'BUSINESS' });
    expect(plan('Edits Studio Pro')).toMatchObject({
      badge: 'BASIC',
      addOn: true,
    });
    expect(plan('Elite Creator')).toMatchObject({
      badge: 'ELITE',
      forAccountType: 'CREATOR',
    });
    // Every plan but the add-on gives a badge.
    for (const candidate of PLAN_CATALOG) {
      expect(candidate.badge === 'BASIC').toBe(candidate.addOn === true);
    }
  });

  it('turns on a plan switched off, and sets features that differ', () => {
    expect(
      planUpdate(
        stored({ isActive: false, features: ['verified_badge'] }),
        plan('Premium'),
        'prod_1',
        'price_m',
        null,
      ),
    ).toEqual({
      features: ['verified_badge', 'priority_support'],
      isActive: true,
    });
  });
});

describe('staleProductDescription', () => {
  it('clears any description the provider shows with a plan', () => {
    expect(
      staleProductDescription({
        description: 'Verificación de negocio y Soporte 24/7 dedicado.',
      }),
    ).toBe(true);
  });

  it('leaves a product with no description alone', () => {
    expect(staleProductDescription({ description: null })).toBe(false);
    expect(staleProductDescription({ description: '' })).toBe(false);
    expect(staleProductDescription({})).toBe(false);
  });
});
