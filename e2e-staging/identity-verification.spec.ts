import { expect, test } from '@playwright/test';
import { signIn, VIEWER } from './session.js';

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

async function stripe(path: string, init: RequestInit = {}) {
  const res = await fetch(`${STRIPE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${stripeKey()}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`Stripe ${path}: ${res.status}`);
  return res.json();
}

// An identity verification started from Settings opens the provider's own
// page, and one given up is cancelled: the provider's notice reaches this
// environment, which then holds no open verification, as the app shows.
test('an identity verification is started from Settings, and its cancellation reaches the app', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  stripeKey();
  const viewer = await signIn(browser, VIEWER, { phone: true });
  const me = (await (await viewer.get('/profiles/me')).json()) as {
    userId?: string;
    user?: { id: string };
  };
  const userId = me.userId ?? me.user?.id;
  expect(userId).toBeTruthy();
  const since = Math.floor(Date.now() / 1000) - 5;

  try {
    await viewer.page.goto('/accounts/account');
    await viewer.page
      .getByRole('button', { name: /^(Verify identity|Verify again)$/ })
      .click();
    // The provider's own page, in test mode.
    await viewer.page.waitForURL(/^https:\/\/verify\.stripe\.com\//, {
      timeout: 30_000,
    });

    const sessions = (await stripe(
      `/identity/verification_sessions?limit=10&created[gte]=${since}`,
    )) as { data: Array<{ id: string; metadata: { userId?: string } }> };
    const session = sessions.data.find((s) => s.metadata.userId === userId);
    expect(session, 'the session the app opened').toBeTruthy();

    // Given up: cancelled at the provider, which sends its notice.
    await stripe(`/identity/verification_sessions/${session?.id}/cancel`, {
      method: 'POST',
    });
    await expect
      .poll(
        async () => {
          const events = (await stripe(
            `/events?type=identity.verification_session.canceled&created[gte]=${since}`,
          )) as {
            data: Array<{
              pending_webhooks: number;
              data: { object: { id: string } };
            }>;
          };
          const event = events.data.find(
            (e) => e.data.object.id === session?.id,
          );
          return event ? event.pending_webhooks : 'none';
        },
        { timeout: 90_000, intervals: [5_000] },
      )
      .toBe(0);

    // The notice was applied: the app holds no open verification, so its
    // own check finds nothing to ask the provider about.
    const synced = await viewer.post('/users/identity-session/sync');
    expect(((await synced.json()) as { status: string }).status).toBe(
      'no_session',
    );
  } finally {
    await viewer.context.close().catch(() => undefined);
  }
});
