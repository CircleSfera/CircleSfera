import { expect, type Page, test } from '@playwright/test';
import { type Session, signIn, VIEWER } from './session.js';

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
async function endOpenSubscriptions(userId: string, since: number) {
  const sessions = await stripe<{ data: CheckoutSession[] }>(
    `/checkout/sessions?limit=100&status=complete&created[gte]=${since}`,
  );
  for (const s of sessions.data) {
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
// the one that verifies gives an adult's document data.
async function verifyIdentityWithTestData(page: Page) {
  await page.goto('/accounts/account');
  await page
    .getByRole('button', { name: /^(Verify identity|Verify again)$/ })
    .click();
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

// The provider's payment page, filled as a person does, with its test card.
async function payOnCheckout(page: Page) {
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, {
    timeout: 30_000,
  });
  // A card, when the page offers other ways to pay first.
  const card = page.getByTestId('card-accordion-item-button');
  if (await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await card.click();
  }
  await page
    .locator('#cardNumber')
    .fill('4242 4242 4242 4242', { timeout: 30_000 });
  await page.locator('#cardExpiry').fill('12 / 34');
  await page.locator('#cardCvc').fill('123');
  await page.locator('#billingName').fill('QA Viewer');
  const country = page.locator('#billingCountry');
  if (await country.isVisible().catch(() => false)) {
    await country.selectOption('ES');
  }
  for (const [id, value] of [
    ['#billingAddressLine1', 'Calle Mayor 1'],
    ['#billingPostalCode', '28013'],
    ['#billingLocality', 'Madrid'],
  ] as const) {
    const field = page.locator(id);
    if (await field.isVisible().catch(() => false)) await field.fill(value);
  }
  // Never saved with the provider's own wallet.
  const save = page.locator('#enableStripePass');
  if (await save.isChecked().catch(() => false)) await save.uncheck();
  await page
    .getByTestId('hosted-payment-submit-button')
    .click({ timeout: 30_000 });
}

// A plan bought on Pricing is paid on the provider's page in test mode; the
// provider's notice reaches this environment and the plan runs. Withdrawing
// at once ends it and refunds the payment at the provider.
test('a plan is bought on Pricing and paid at the provider; withdrawing ends it and refunds it', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  stripeKey();
  const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  const viewer = await signIn(browser, VIEWER, { phone: true });
  const me = (await (await viewer.get('/profiles/me')).json()) as {
    userId?: string;
    user?: { id: string };
  };
  const userId = me.userId ?? me.user?.id;
  expect(userId).toBeTruthy();
  if (!userId) return;

  try {
    // Nothing left running from an earlier run.
    await endOpenSubscriptions(userId, since);
    await expect
      .poll(async () => (await billing(viewer)).hasActiveSubscription, {
        timeout: 90_000,
        intervals: [5_000],
      })
      .toBe(false);

    // Only an adult with a verified identity pays.
    const page = viewer.page;
    // Said as the app holds it, so a failure shows which part is missing.
    const identity = async () => {
      const now = (await (await viewer.get('/profiles/me')).json()) as {
        identityVerifiedAt?: string | null;
        dateOfBirthVerified?: boolean;
      };
      return `identity verified: ${!!now.identityVerifiedAt}, date of birth verified: ${!!now.dateOfBirthVerified}`;
    };
    const ADULT = 'identity verified: true, date of birth verified: true';
    if ((await identity()) !== ADULT) {
      const asked = Math.floor(Date.now() / 1000) - 5;
      await verifyIdentityWithTestData(page);
      // What the provider holds of the session: its status, and whether it
      // read a date of birth (never the date itself).
      const provider = async () => {
        const sessions = await stripe<{
          data: Array<{ id: string; metadata: { userId?: string } }>;
        }>(`/identity/verification_sessions?limit=10&created[gte]=${asked}`);
        const mine = sessions.data.find((s) => s.metadata.userId === userId);
        if (!mine) return 'provider: no session';
        const full = await stripe<{
          status: string;
          verified_outputs?: { dob?: { year?: number } | null } | null;
        }>(
          `/identity/verification_sessions/${mine.id}?expand[]=verified_outputs`,
        );
        return `provider: ${full.status}, date of birth read: ${!!full.verified_outputs?.dob?.year}`;
      };
      await expect
        .poll(
          async () => {
            const sync = await viewer.post('/users/identity-session/sync');
            const said = (await sync.json().catch(() => ({}))) as {
              status?: string;
            };
            const held = await identity();
            return held === ADULT
              ? held
              : `${held}; sync: ${sync.status()} ${said.status}; ${await provider()}`;
          },
          { timeout: 90_000, intervals: [5_000] },
        )
        .toBe(ADULT);
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
      payments?: { data: Array<{ payment: { payment_intent?: string } }> };
    }>(`/invoices/${sub.latest_invoice}?expand[]=payments`);
    const intent = invoice.payments?.data[0]?.payment.payment_intent;
    expect(intent, 'the payment of the first invoice').toBeTruthy();
    await expect
      .poll(
        async () => {
          const refunds = await stripe<{
            data: Array<{ status: string; amount: number }>;
          }>(`/refunds?payment_intent=${intent}`);
          return refunds.data.reduce(
            (sum, r) => (r.status === 'failed' ? sum : sum + r.amount),
            0,
          );
        },
        { timeout: 60_000, intervals: [5_000] },
      )
      .toBeGreaterThan(0);
  } finally {
    await endOpenSubscriptions(userId, since).catch(() => undefined);
    await viewer.context.close().catch(() => undefined);
  }
});
