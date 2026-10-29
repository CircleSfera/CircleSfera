import { describe, expect, it, vi } from 'vitest';
import { ProviderDeliveryWatchService } from './provider-delivery-watch.service.js';

describe('ProviderDeliveryWatchService', () => {
  const now = new Date('2026-10-29T12:00:00.000Z');
  const setup = (
    undelivered: Record<string, { id: string; type: string }[] | Error>,
  ) => {
    const prisma = {
      monetization: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { stripeConnectAccountId: 'acct_a' },
            { stripeConnectAccountId: 'acct_b' },
          ]),
      },
    };
    const stripe = {
      listUndeliveredEvents: vi.fn(
        async (_window: unknown, account?: string) => {
          const answer = undelivered[account ?? 'platform'] ?? [];
          if (answer instanceof Error) throw answer;
          return answer;
        },
      ),
    };
    const events = { emit: vi.fn() };
    const service = new ProviderDeliveryWatchService(
      prisma as never,
      stripe as never,
      events as never,
    );
    return { service, stripe, events };
  };

  it('reads the platform and every creator account, between one and twenty-four hours ago', async () => {
    const { service, stripe, events } = setup({});

    await expect(service.checkDeliveries(now)).resolves.toEqual([]);

    const window = {
      from: new Date('2026-10-28T12:00:00.000Z'),
      to: new Date('2026-10-29T11:00:00.000Z'),
    };
    expect(stripe.listUndeliveredEvents).toHaveBeenCalledWith(
      window,
      undefined,
    );
    expect(stripe.listUndeliveredEvents).toHaveBeenCalledWith(window, 'acct_a');
    expect(stripe.listUndeliveredEvents).toHaveBeenCalledWith(window, 'acct_b');
    // All delivered: nobody is told anything.
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('tells the team of every event the provider could not deliver', async () => {
    const { service, events } = setup({
      platform: [{ id: 'evt_1', type: 'checkout.session.completed' }],
      acct_b: [{ id: 'evt_2', type: 'account.updated' }],
    });

    await expect(service.checkDeliveries(now)).resolves.toEqual([
      'checkout.session.completed evt_1',
      'account.updated evt_2',
    ]);
    expect(events.emit).toHaveBeenCalledWith('system.incident', {
      message:
        'The payment provider could not deliver 2 event(s) to the server: checkout.session.completed evt_1, account.updated evt_2',
      path: 'stripe://webhook-deliveries',
      statusCode: 502,
      timestamp: now.toISOString(),
    });
  });

  it('names at most ten events in one alert', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `evt_${i}`,
      type: 'payout.paid',
    }));
    const { service, events } = setup({ platform: many });

    await service.checkDeliveries(now);

    const { message } = events.emit.mock.calls[0][1];
    expect(message).toContain('could not deliver 12 event(s)');
    expect(message).toContain('evt_9');
    expect(message).not.toContain('evt_10');
  });

  it('keeps reading the other accounts when one cannot be read', async () => {
    const { service, events } = setup({
      platform: new Error('Stripe down'),
      acct_a: [{ id: 'evt_3', type: 'payout.failed' }],
    });

    await expect(service.checkDeliveries(now)).resolves.toEqual([
      'payout.failed evt_3',
    ]);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });
});
