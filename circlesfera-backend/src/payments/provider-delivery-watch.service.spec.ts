import { describe, expect, it, vi } from 'vitest';
import { ProviderDeliveryWatchService } from './provider-delivery-watch.service.js';

describe('ProviderDeliveryWatchService', () => {
  const now = new Date('2026-10-29T12:00:00.000Z');
  const setup = (undelivered: { id: string; type: string }[] | Error) => {
    const stripe = {
      listUndeliveredEvents: vi.fn(async () => {
        if (undelivered instanceof Error) throw undelivered;
        return undelivered;
      }),
    };
    const events = { emit: vi.fn() };
    const service = new ProviderDeliveryWatchService(
      stripe as never,
      events as never,
    );
    return { service, stripe, events };
  };

  it('reads the platform between one and twenty-four hours ago', async () => {
    const { service, stripe, events } = setup([]);

    await expect(service.checkDeliveries(now)).resolves.toEqual([]);

    expect(stripe.listUndeliveredEvents).toHaveBeenCalledWith({
      from: new Date('2026-10-28T12:00:00.000Z'),
      to: new Date('2026-10-29T11:00:00.000Z'),
    });
    // All delivered: nobody is told anything.
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('tells the team of every event the provider could not deliver', async () => {
    const { service, events } = setup([
      { id: 'evt_1', type: 'checkout.session.completed' },
      { id: 'evt_2', type: 'invoice.payment_failed' },
    ]);

    await expect(service.checkDeliveries(now)).resolves.toEqual([
      'checkout.session.completed evt_1',
      'invoice.payment_failed evt_2',
    ]);
    expect(events.emit).toHaveBeenCalledWith('system.incident', {
      message:
        'The payment provider could not deliver 2 event(s) to the server: checkout.session.completed evt_1, invoice.payment_failed evt_2',
      path: 'stripe://webhook-deliveries',
      statusCode: 502,
      timestamp: now.toISOString(),
    });
  });

  it('names at most ten events in one alert', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `evt_${i}`,
      type: 'charge.refunded',
    }));
    const { service, events } = setup(many);

    await service.checkDeliveries(now);

    const { message } = events.emit.mock.calls[0][1];
    expect(message).toContain('could not deliver 12 event(s)');
    expect(message).toContain('evt_9');
    expect(message).not.toContain('evt_10');
  });

  it('tells nobody when the provider cannot be read', async () => {
    const { service, events } = setup(new Error('Stripe down'));

    await expect(service.checkDeliveries(now)).resolves.toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });
});
