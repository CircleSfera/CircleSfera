import { expect, type Locator, type Page, test } from '@playwright/test';
import { PAYER, type Session, signIn } from './session.js';

const STRIPE = 'https://api.stripe.com/v1';

// The test-mode key of this environment's own account at the payment
// provider. A live key is refused: this check never touches real money.
function stripeKey(): string {
  const key = process.env.STAGING_STRIPE_SECRET_KEY ?? '';
  if (!/^(sk|rk)_test_/.test(key)) {
    throw new Error('STAGING_STRIPE_SECRET_KEY must be a test-mode key');
  }
  return key;
}

async function stripe<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${STRIPE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${stripeKey()}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`Stripe ${path}: ${res.status}`);
  return (await res.json()) as T;
}

type BillingStatus = {
  hasActiveSubscription: boolean;
  subscription: {
    planName: string;
    status: string;
    billingInterval: string;
    priceCents: number;
    withdrawableUntil: string | null;
  } | null;
};

type CheckoutSession = {
  id: string;
  status: string;
  customer: string | null;
  subscription: string | null;
  metadata: { userId?: string };
};

async function billing(session: Session): Promise<BillingStatus> {
  const res = await session.get('/payments/status');
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as BillingStatus;
}

// Ends at the provider every subscription a checkout of this account
// started that still runs: one left by an earlier run, or by this one if it
// stopped before withdrawing. The provider's notice then ends it in the app.
// Every completed checkout of the account, page after page and however old:
// a subscription left by an interrupted run renews on, while its checkout
// keeps the date it was made.
async function completedCheckouts(): Promise<CheckoutSession[]> {
  const all: CheckoutSession[] = [];
  let after = '';
  for (;;) {
    const page = await stripe<{ data: CheckoutSession[]; has_more: boolean }>(
      `/checkout/sessions?limit=100&status=complete${after}`,
    );
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) return all;
    after = `&starting_after=${page.data[page.data.length - 1].id}`;
  }
}

async function endOpenSubscriptions(userId: string) {
  for (const s of await completedCheckouts()) {
    if (s.metadata.userId !== userId || !s.subscription) continue;
    const sub = await stripe<{ status: string }>(
      `/subscriptions/${s.subscription}`,
    );
    if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
      await stripe(`/subscriptions/${s.subscription}`, { method: 'DELETE' });
    }
  }
}

// The provider's identity page in test mode offers its own test outcomes;
// the one that verifies the identity.
async function verifyIdentityWithTestData(page: Page) {
  await page.goto('/accounts/account');
  await page.getByRole('button', { name: 'Verify identity' }).click();
  await page.waitForURL(/^https:\/\/verify\.stripe\.com\//, {
    timeout: 30_000,
  });
  // The page shown only in test mode: "Complete with test data", with the
  // outcome chosen in a list and sent with "Submit".
  await page
    .getByRole('combobox', { name: 'autocompleteSetting' })
    .selectOption({ label: 'Verification success' }, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Submit' }).click({ timeout: 30_000 });
  // Back on CircleSfera once the provider is done, by itself or through
  // its own button.
  const back = page.getByRole('button', { name: /circlesfera|return|done/i });
  await Promise.race([
    page.waitForURL(/circlesfera\.com/, { timeout: 60_000 }),
    // Never fails the race itself: the address decides.
    back
      .first()
      .click({ timeout: 60_000 })
      .then(() => page.waitForURL(/circlesfera\.com/, { timeout: 30_000 }))
      .catch(() => new Promise<never>(() => undefined)),
  ]);
}

// A field of the provider's payment page, in whichever frame holds it: the
// card and the billing address sit in the provider's own frames. Waits for it
// to show, up to the time given.
async function fieldOnCheckout(
  page: Page,
  selector: string,
  timeout = 30_000,
): Promise<Locator | null> {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const frame of page.frames()) {
      const found = frame.locator(selector).first();
      if (await found.isVisible().catch(() => false)) return found;
    }
    if (Date.now() > deadline) return null;
    await page.waitForTimeout(500);
  }
}

// The provider's payment page, filled as a person does, with its test card.
// The fields are found by their standard autocomplete names, which stay when
// the provider redesigns its page (its own ids did not).
async function payOnCheckout(page: Page) {
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, {
    timeout: 30_000,
  });
  // The currency is left as the page offers it: switching it closes the
  // provider's test page. The refund is checked against what was paid.
  // A card, when the page offers other ways to pay first and the card form
  // is not open yet (clicking it then would close it).
  const cardForm = await fieldOnCheckout(
    page,
    'input[autocomplete$="cc-number"]',
    10_000,
  );
  const card = page.getByTestId('card-accordion-item-button');
  if (!cardForm && (await card.isVisible().catch(() => false))) {
    await card.click();
  }
  const fill = async (selector: string, value: string, required = true) => {
    const field = await fieldOnCheckout(
      page,
      selector,
      required ? 30_000 : 2_000,
    );
    if (field) await field.fill(value);
    else if (required) throw new Error(`No ${selector} on the payment page`);
  };
  await fill('input[autocomplete$="cc-number"]', '4242 4242 4242 4242');
  await fill('input[autocomplete$="cc-exp"]', '12 / 34');
  await fill('input[autocomplete$="cc-csc"]', '123');
  // Never saved with the provider's own wallet, which would ask for a phone.
  const save = await fieldOnCheckout(page, 'input[name="linkOptIn"]', 2_000);
  if (save && (await save.isChecked().catch(() => false))) {
    await save.uncheck({ force: true });
  }
  await fill(
    'input[autocomplete="billing name"], input[autocomplete="cc-name"]',
    'QA Payer',
    false,
  );
  const country = await fieldOnCheckout(
    page,
    'select[autocomplete$="country"]',
    2_000,
  );
  if (country) await country.selectOption('ES');
  await fill('input[autocomplete$="address-line1"]', 'Calle Mayor 1', false);
  await fill('input[autocomplete$="address-level2"]', 'Madrid', false);
  await fill('input[autocomplete$="postal-code"]', '28013', false);
  // The province, which an address in Spain needs.
  const province = await fieldOnCheckout(
    page,
    'select[autocomplete$="address-level1"]',
    2_000,
  );
  if (province) await province.selectOption({ label: 'Madrid' });
  // The pay button, by the test id of the page as it is now or as it was.
  const pay = await fieldOnCheckout(
    page,
    '[data-testid="payment-form-submit-button"]:not([disabled]), [data-testid="hosted-payment-submit-button"]:not([disabled])',
  );
  if (!pay) throw new Error('The pay button never became active');
  await pay.click();
}
// A plan bought on Pricing is paid on the provider's page in test mode; the
// provider's notice reaches this environment and the plan runs. Withdrawing
// at once ends it and refunds the payment at the provider.
test('a plan is bought on Pricing and paid at the provider; withdrawing ends it and refunds it', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  stripeKey();
  // The checkout of this run is made after this moment.
  const since = Math.floor(Date.now() / 1000) - 60;
  const viewer = await signIn(browser, PAYER, { phone: true });
  const me = (await (await viewer.get('/profiles/me')).json()) as {
    userId?: string;
    user?: { id: string };
  };
  const userId = me.userId ?? me.user?.id;
  expect(userId).toBeTruthy();
  if (!userId) return;

  try {
    // Nothing left running from an earlier run.
    await endOpenSubscriptions(userId);
    await expect
      .poll(async () => (await billing(viewer)).hasActiveSubscription, {
        timeout: 90_000,
        intervals: [5_000],
      })
      .toBe(false);

    // An adult pays, by the date of birth the Test Account was made with;
    // Verified carries the badge, so it also needs the identity verified.
    const page = viewer.page;
    const verified = async () => {
      const now = (await (await viewer.get('/profiles/me')).json()) as {
        identityVerifiedAt?: string | null;
      };
      return !!now.identityVerifiedAt;
    };
    if (!(await verified())) {
      const asked = Math.floor(Date.now() / 1000) - 5;
      await verifyIdentityWithTestData(page);
      // What the provider holds of the session, so a failure shows where it
      // stopped.
      const provider = async () => {
        const sessions = await stripe<{
          data: Array<{ status: string; metadata: { userId?: string } }>;
        }>(`/identity/verification_sessions?limit=10&created[gte]=${asked}`);
        const mine = sessions.data.find((s) => s.metadata.userId === userId);
        return `provider: ${mine?.status ?? 'no session'}`;
      };
      await expect
        .poll(
          async () => {
            const sync = await viewer.post('/users/identity-session/sync');
            if (await verified()) return 'identity verified';
            return `not verified; sync: ${sync.status()}; ${await provider()}`;
          },
          { timeout: 90_000, intervals: [5_000] },
        )
        .toBe('identity verified');
    }

    // Verified, by the month: the cheapest plan.
    await page.goto('/pricing');
    await page
      .getByRole('button', { name: 'Choose Verified' })
      .click({ timeout: 30_000 });
    const dialog = page.getByRole('dialog', { name: 'Before you pay' });
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Continue to payment' }).click();
    await payOnCheckout(page);

    // Back in the app, and the provider's notice applied.
    await page.waitForURL(/\/accounts\/billing\?.*success=true/, {
      timeout: 90_000,
    });
    await expect
      .poll(async () => (await billing(viewer)).subscription?.status, {
        timeout: 120_000,
        intervals: [5_000],
      })
      .toBe('ACTIVE');
    const bought = await billing(viewer);
    expect(bought.subscription).toMatchObject({
      planName: 'Verified',
      billingInterval: 'month',
      priceCents: 499,
    });
    expect(bought.subscription?.withdrawableUntil).toBeTruthy();

    // Withdrawn within the 14 days: it ends, and the payment is refunded.
    const sessions = await stripe<{ data: CheckoutSession[] }>(
      `/checkout/sessions?limit=10&status=complete&created[gte]=${since}`,
    );
    const paid = sessions.data.find((s) => s.metadata.userId === userId);
    expect(
      paid?.subscription,
      'the subscription the checkout made',
    ).toBeTruthy();
    const withdrawn = await viewer.post('/payments/plan/withdraw');
    expect(withdrawn.ok(), await withdrawn.text()).toBe(true);
    await expect
      .poll(async () => (await billing(viewer)).hasActiveSubscription, {
        timeout: 90_000,
        intervals: [5_000],
      })
      .toBe(false);
    const sub = await stripe<{ status: string; latest_invoice: string }>(
      `/subscriptions/${paid?.subscription}`,
    );
    expect(sub.status).toBe('canceled');
    const invoice = await stripe<{
      amount_paid: number;
      payments?: { data: Array<{ payment: { payment_intent?: string } }> };
    }>(`/invoices/${sub.latest_invoice}?expand[]=payments`);
    const intent = invoice.payments?.data[0]?.payment.payment_intent;
    expect(intent, 'the payment of the first invoice').toBeTruthy();
    // The unused part of the month: the plan ran for a few minutes, so all of
    // the payment but what an hour of a 28-day month is worth, at most.
    const paidCents = invoice.amount_paid;
    const leastCents = Math.floor(paidCents * (1 - 1 / (28 * 24)));
    const refundedCents = async () => {
      const refunds = await stripe<{
        data: Array<{ status: string; amount: number }>;
      }>(`/refunds?payment_intent=${intent}`);
      return refunds.data.reduce(
        (sum, r) => (r.status === 'failed' ? sum : sum + r.amount),
        0,
      );
    };
    await expect
      .poll(refundedCents, { timeout: 60_000, intervals: [5_000] })
      .toBeGreaterThanOrEqual(leastCents);
    expect(await refundedCents()).toBeLessThanOrEqual(paidCents);
  } finally {
    await endOpenSubscriptions(userId).catch(() => undefined);
    await viewer.context.close().catch(() => undefined);
  }
});
