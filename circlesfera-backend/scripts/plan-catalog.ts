// The platform plans CircleSfera sells, what each includes (PD-013, PD-047)
// and its monthly price, VAT included (BD-005, BD-021). A benefit is listed
// here once it is built, never before; `verified_badge` is also the key the
// profile reads to show the badge.
export type CatalogPlan = {
  name: string;
  // Names a stored plan had before, told apart by its price.
  formerNames: readonly string[];
  priceCents: number;
  description: string;
  features: readonly string[];
};

export const PLAN_CATALOG: readonly CatalogPlan[] = [
  {
    name: 'Verified',
    formerNames: [],
    priceCents: 499,
    description: 'Verified badge.',
    features: ['verified_badge'],
  },
  {
    // The €9.99 plan was once named Verified.
    name: 'Premium',
    formerNames: ['Verified'],
    priceCents: 999,
    description: 'Verified badge and priority support.',
    features: ['verified_badge', 'priority_support'],
  },
  {
    name: 'Elite Creator',
    formerNames: [],
    priceCents: 1999,
    description:
      'Elite badge, priority support, a feed without promoted posts and advanced analytics.',
    features: [
      'verified_badge',
      'priority_support',
      'no_promoted_content',
      'advanced_analytics',
    ],
  },
  {
    name: 'Business',
    formerNames: [],
    priceCents: 4999,
    description:
      'Business badge, priority support, a feed without promoted posts, advanced analytics and team access for up to 5 people.',
    features: [
      'verified_badge',
      'priority_support',
      'no_promoted_content',
      'advanced_analytics',
      'team_access',
    ],
  },
];

// What is read of the payment provider's catalog.
export type ProviderPrice = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  tax_behavior?: string | null;
  recurring: { interval: string } | null;
};
export type ProviderProduct = {
  id: string;
  name: string;
  active: boolean;
  metadata: Record<string, string>;
  default_price: ProviderPrice | string | null;
};

// What is read of a stored plan.
export type StoredPlan = {
  id: string;
  name: string;
  priceCents: number;
  description: string | null;
  features: string[];
  currency: string;
  interval: string;
  stripeProductId: string;
  stripePriceId: string;
  yearlyStripePriceId: string | null;
  isActive: boolean;
};

/**
 * The product of a plan in the provider's own catalog (live or test): the
 * active one labelled with the plan (metadata circlesfera_plan), else the
 * active one with its exact name. Two candidates are refused: which one is
 * meant is not guessed.
 */
export function findProviderProduct(
  products: readonly ProviderProduct[],
  plan: CatalogPlan,
): { product?: ProviderProduct; problem?: string } {
  const active = products.filter((product) => product.active);
  const labelled = active.filter(
    (product) => product.metadata?.circlesfera_plan === plan.name,
  );
  const candidates =
    labelled.length > 0
      ? labelled
      : active.filter((product) => product.name === plan.name);
  if (candidates.length === 0) {
    return { problem: `${plan.name}: no active product in the provider` };
  }
  if (candidates.length > 1) {
    return {
      problem: `${plan.name}: ${candidates.length} active products match (${candidates.map((p) => p.id).join(', ')})`,
    };
  }
  return { product: candidates[0] };
}

// What is wrong with the default price of a plan's product, if anything:
// it must be the plan's monthly price in euros, VAT included.
export function priceProblems(
  price: ProviderPrice | string | null,
  plan: CatalogPlan,
): string[] {
  if (!price || typeof price === 'string') {
    return [`${plan.name}: the product has no default price`];
  }
  const problems: string[] = [];
  if (!price.active) problems.push('it is archived');
  if (price.recurring?.interval !== 'month') problems.push('it is not monthly');
  if (price.currency !== 'eur') problems.push(`it is in ${price.currency}`);
  if (price.unit_amount !== plan.priceCents) {
    problems.push(`it is ${price.unit_amount} cents, not ${plan.priceCents}`);
  }
  if (price.tax_behavior !== 'inclusive') {
    problems.push(`its VAT is ${price.tax_behavior ?? 'unset'}, not inclusive`);
  }
  return problems.map(
    (problem) => `${plan.name}: the default price ${problem}`,
  );
}

/**
 * The stored plan a catalog plan is: the one with its product, else one with
 * its name or a former name and its price. In a database copied from
 * another environment the products differ, and the name with the price
 * still finds the plan.
 */
export function findStoredPlan(
  stored: readonly StoredPlan[],
  plan: CatalogPlan,
  productId: string,
): StoredPlan | undefined {
  const byProduct = stored.find((row) => row.stripeProductId === productId);
  if (byProduct) return byProduct;
  const names = [plan.name, ...plan.formerNames].map((name) =>
    name.toLowerCase(),
  );
  return stored.find(
    (row) =>
      names.includes(row.name.toLowerCase()) &&
      row.priceCents === plan.priceCents,
  );
}

/**
 * What a stored plan must be set to, or null when it is already so. A yearly
 * price that is not one of the product's active prices is cleared: it names
 * a price of another environment or one archived since.
 */
export function planUpdate(
  row: StoredPlan | undefined,
  plan: CatalogPlan,
  productId: string,
  priceId: string,
  activePriceIds: readonly string[],
): Record<string, unknown> | null {
  const target = {
    name: plan.name,
    description: plan.description,
    features: [...plan.features],
    priceCents: plan.priceCents,
    currency: 'EUR',
    interval: 'month',
    stripeProductId: productId,
    stripePriceId: priceId,
    isActive: true,
    ...(row?.yearlyStripePriceId &&
    !activePriceIds.includes(row.yearlyStripePriceId)
      ? { yearlyStripePriceId: null, yearlyPriceCents: null }
      : {}),
  };
  if (!row) return target;
  const changed = Object.fromEntries(
    Object.entries(target).filter(([key, value]) => {
      const current = (row as Record<string, unknown>)[key];
      return Array.isArray(value)
        ? !Array.isArray(current) || current.join(',') !== value.join(',')
        : current !== value;
    }),
  );
  return Object.keys(changed).length > 0 ? changed : null;
}
