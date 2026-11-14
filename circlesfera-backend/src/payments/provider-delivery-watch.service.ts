import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StripeService } from '../common/stripe/stripe.service.js';

// Retries of the provider's own come within this time; an event still not
// delivered after it is a fault, and older ones were told before.
const SETTLE_MS = 60 * 60 * 1000;
const LOOK_BACK_MS = 24 * 60 * 60 * 1000;

/**
 * Tells the team when the payment provider cannot deliver its events to the
 * server: a refused signature or an unreachable address answers the
 * provider, not the error tracker, and payments and plan changes then go
 * unrecorded without anyone seeing it.
 */
@Injectable()
export class ProviderDeliveryWatchService {
  private readonly logger = new Logger(ProviderDeliveryWatchService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkDeliveries(now = new Date()): Promise<string[]> {
    const window = {
      from: new Date(now.getTime() - LOOK_BACK_MS),
      to: new Date(now.getTime() - SETTLE_MS),
    };

    let undelivered: string[];
    try {
      const events = await this.stripeService.listUndeliveredEvents(window);
      undelivered = events.map((event) => `${event.type} ${event.id}`);
    } catch (error) {
      this.logger.warn("Could not read the provider's deliveries", error);
      return [];
    }

    if (undelivered.length > 0) {
      const message = `The payment provider could not deliver ${undelivered.length} event(s) to the server: ${undelivered.slice(0, 10).join(', ')}`;
      this.logger.error(message);
      this.eventEmitter.emit('system.incident', {
        message,
        path: 'stripe://webhook-deliveries',
        statusCode: 502,
        timestamp: now.toISOString(),
      });
    }
    return undelivered;
  }
}
