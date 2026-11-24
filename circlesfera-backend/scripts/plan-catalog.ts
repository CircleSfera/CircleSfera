// The platform plans CircleSfera sells, what each includes, its monthly
// price and, for the plans, its yearly price (BD-016), VAT included. A benefit is listed
// here once it is built, never before; `verified_badge` is also the key the
// profile reads to show the badge.
export type CatalogPlan = {
  name: string;
  // Names a stored plan had before, told apart by its price.
  formerNames: readonly string[];
  priceCents: number;
  // The price of a year, when the plan is sold by the year too (BD-016);
  // it is on sale once the provider has that price.
  yearlyPriceCents?: number;
  description: string;
  features: readonly string[];
  // What the plan gives and to whom, read by the server instead of its
  // name: the badge level, the type of Profile it is for (none: any), and
  // whether it is an add-on held beside a plan.
  badge: 'BASIC' | 'VERIFIED' | 'ELITE' | 'BUSINESS';
  forAccountType?: 'CREATOR' | 'BUSINESS';
  addOn?: boolean;
  // False keeps the plan in the catalog but off sale (BD-032): the sync takes
  // it off sale and never puts it back; staff may still take others off.
  onSale?: boolean;
};

// On sale at launch (BD-032, owner, 2026-11-24): Verified, which now
// includes priority support, and Business. Premium, Elite Creator and Edits
// Studio Pro stay in the catalog off sale until conversion data says
// otherwise; nobody holds them.
export const PLAN_CATALOG: readonly CatalogPlan[] = [
  {
    name: 'Verified',
    formerNames: [],
    priceCents: 499,
    yearlyPriceCents: 4990,
    description: 'Verified badge and priority support.',
    features: ['verified_badge', 'priority_support'],
    badge: 'VERIFIED',
  },
  {
    // The €9.99 plan was once named Verified.
    name: 'Premium',
    formerNames: ['Verified'],
    priceCents: 999,
    yearlyPriceCents: 9990,
    description: 'Verified badge and priority support.',
    features: ['verified_badge', 'priority_support'],
    badge: 'VERIFIED',
    // Merged into Verified (BD-032).
    onSale: false,
  },
  {
    name: 'Elite Creator',
    formerNames: [],
    badge: 'ELITE',
    forAccountType: 'CREATOR',
    onSale: false,
    priceCents: 1999,
    yearlyPriceCents: 19990,
    description:
      'Elite badge, priority support, a feed without promoted posts, advanced analytics and Edits Studio Pro.',
    features: [
      'verified_badge',
      'priority_support',
      'no_promoted_content',
      'advanced_analytics',
      'studio_pro',
    ],
  },
  {
    name: 'Business',
    formerNames: [],
    badge: 'BUSINESS',
    forAccountType: 'BUSINESS',
    priceCents: 4999,
    yearlyPriceCents: 49990,
    description:
      'Business badge, priority support, a feed without promoted posts, advanced analytics, team access for up to 5 people and Edits Studio Pro.',
    features: [
      'verified_badge',
      'priority_support',
      'no_promoted_content',
      'advanced_analytics',
      'team_access',
      'studio_pro',
    ],
  },
  {
    // An add-on, held beside Verified or Premium.
    name: 'Edits Studio Pro',
    formerNames: [],
    badge: 'BASIC',
    addOn: true,
    onSale: false,
    priceCents: 799,
    description:
      'Edits Studio Pro: export in up to 4K and at 60 fps on a computer, keyframe curves, the duotone, kaleidoscope, light leak and VHS effects, and the whip pan, glitch, spin and zoom blur transitions.',
    features: ['studio_pro'],
  },
];

// What is read of the payment provider's catalog.
export type ProviderPrice = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  tax_behavior?: string | null;
  recurring: { interval: string; interval_count?: number } | null;
};
export type ProviderProduct = {
  id: string;
  name: string;
  description?: string | null;
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
  yearlyPriceCents: number | null;
  isActive: boolean;
  badge: string;
  forAccountType: string | null;
  addOn: boolean;
};

// The provider shows a product's description to the buyer at checkout and
// on the invoice, in one language whatever the buyer's. What a plan includes
// is shown in the app, in the buyer's language, before paying; the product
// keeps none of its own, so it can never promise what the plan does not give.
export function staleProductDescription(
  product: Pick<ProviderProduct, 'description'>,
): boolean {
  return Boolean(product.description);
}

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

/**
 * The price a plan is sold at: its product's default price, else the one
 * active monthly price in euros the product has. A product with no default
 * and several such prices has none: which one is meant is not guessed.
 */
export function planPrice(
  product: ProviderProduct,
  activePrices: readonly ProviderPrice[],
): ProviderPrice | string | null {
  if (product.default_price) return product.default_price;
  const monthly = activePrices.filter(
    (price) =>
      price.currency === 'eur' && price.recurring?.interval === 'month',
  );
  return monthly.length === 1 ? monthly[0] : null;
}

// VAT included: said on the price, or left to an account whose tax default
// includes it, always or, inferred by currency, in euros.
function vatIncluded(
  price: ProviderPrice,
  accountTaxBehavior: string | null,
): boolean {
  const accountIncludesVat =
    accountTaxBehavior === 'inclusive' ||
    (accountTaxBehavior === 'inferred_by_currency' && price.currency === 'eur');
  return (
    price.tax_behavior === 'inclusive' ||
    (price.tax_behavior === 'unspecified' && accountIncludesVat)
  );
}

/**
 * The yearly price a plan is sold at (BD-016): the one active yearly price
 * of its product in euros at the catalog's yearly amount, VAT included.
 * None, with a notice, while the provider has no such price or has several
 * (which one is meant is not guessed): the plan is then sold monthly only,
 * and the run does not fail, since the yearly prices are created at the
 * provider by hand.
 */
export function planYearlyPrice(
  activePrices: readonly ProviderPrice[],
  plan: CatalogPlan,
  accountTaxBehavior: string | null = null,
): { price?: ProviderPrice; notice?: string } {
  if (!plan.yearlyPriceCents) return {};
  const matching = activePrices.filter(
    (price) =>
      price.active &&
      price.currency === 'eur' &&
      price.recurring?.interval === 'year' &&
      // Once a year, never every two or more.
      (price.recurring.interval_count ?? 1) === 1 &&
      price.unit_amount === plan.yearlyPriceCents &&
      vatIncluded(price, accountTaxBehavior),
  );
  if (matching.length === 1) return { price: matching[0] };
  return {
    notice:
      matching.length === 0
        ? `${plan.name}: no active yearly price of ${plan.yearlyPriceCents} cents in euros, VAT included; sold monthly only`
        : `${plan.name}: ${matching.length} yearly prices match (${matching.map((p) => p.id).join(', ')}); sold monthly only`,
  };
}

// What is wrong with the default price of a plan's product, if anything:
// it must be the plan's monthly price in euros, VAT included.
export function priceProblems(
  price: ProviderPrice | string | null,
  plan: CatalogPlan,
  // The account's tax default (Tax settings), which a price that leaves
  // VAT to the account follows; unknown when it could not be read.
  accountTaxBehavior: string | null = null,
): string[] {
  if (!price || typeof price === 'string') {
    return [
      `${plan.name}: the product has no default price, nor a single monthly price in euros`,
    ];
  }
  const problems: string[] = [];
  if (!price.active) problems.push('it is archived');
  if (price.recurring?.interval !== 'month') problems.push('it is not monthly');
  if (price.currency !== 'eur') problems.push(`it is in ${price.currency}`);
  if (price.unit_amount !== plan.priceCents) {
    problems.push(`it is ${price.unit_amount} cents, not ${plan.priceCents}`);
  }
  if (!vatIncluded(price, accountTaxBehavior)) {
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
 * What a stored plan must be set to, or null when it is already so. Its
 * yearly price is the one found for this environment, or none: a yearly
 * price of another environment, one archived since, or one at another
 * amount is cleared.
 */
export function planUpdate(
  row: StoredPlan | undefined,
  plan: CatalogPlan,
  productId: string,
  priceId: string,
  yearlyPrice: { id: string; cents: number } | null,
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
    yearlyStripePriceId: yearlyPrice?.id ?? null,
    yearlyPriceCents: yearlyPrice?.cents ?? null,
    badge: plan.badge,
    forAccountType: plan.forAccountType ?? null,
    addOn: plan.addOn ?? false,
  };
  // A new plan goes on sale unless the catalog keeps it off; after that,
  // the catalog may only take a plan off sale (BD-032) and staff decide the
  // rest (the admin panel): the sync never puts back one taken off.
  const onSale = plan.onSale ?? true;
  if (!row) return { ...target, isActive: onSale };
  const changed: Record<string, unknown> = planChanges(row, target);
  if (!onSale && row.isActive) changed.isActive = false;
  return Object.keys(changed).length > 0 ? changed : null;
}

// The fields of `target` the stored plan does not have yet.
function planChanges(
  row: StoredPlan,
  target: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(target).filter(([key, value]) => {
      const current = (row as Record<string, unknown>)[key];
      return Array.isArray(value)
        ? !Array.isArray(current) || current.join(',') !== value.join(',')
        : current !== value;
    }),
  );
}
