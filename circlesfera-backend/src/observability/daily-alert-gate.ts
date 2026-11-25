import type { Redis } from 'ioredis';

// A day's mark outlives the day, whatever the time zone of the reader.
const MARK_TTL_SECONDS = 2 * 24 * 60 * 60;

/**
 * How long a claimed alert waits for word of its delivery before it may be
 * claimed again: Slack's own retries take seconds, so a claim with no answer
 * after this (no channel listening) does not hold the alert back all day.
 */
export const ALERT_PENDING_MS = 2 * 60 * 1000;

/** The UTC day of a moment, as the marks name it: 2026-11-25. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** An alert this instance may send now; it says how the sending went. */
export interface AlertClaim {
  /** It reached the channel: no more today, here or on another instance. */
  delivered(): Promise<void>;
  /** It did not: a later check the same day may send it again. */
  failed(): void;
}

/**
 * Lets an alert out once per key per UTC day, counting only alerts that
 * reached the channel.
 *
 * - A claim is recorded in this instance's memory before anything is
 *   awaited, so two checks that overlap never both send it.
 * - Only a delivered alert is marked sent: in memory, and in Redis so a
 *   restart or another instance does not send it again. A failed delivery
 *   leaves it free for the next check.
 * - This instance's own record is read first: an alert it sent while Redis
 *   was down is not sent again when Redis is back, and its mark is then
 *   written to Redis too.
 */
export class DailyAlertGate {
  private readonly sent = new Set<string>();
  private readonly pending = new Map<string, number>();

  constructor(
    private readonly redis: Pick<Redis, 'set' | 'exists'> | undefined,
    private readonly prefix: string,
    private readonly pendingMs = ALERT_PENDING_MS,
  ) {}

  async claim(
    key: string,
    day: string,
    now = Date.now(),
  ): Promise<AlertClaim | null> {
    const mark = `${this.prefix}:${key}:${day}`;
    this.forgetOtherDays(day);

    if (this.sent.has(mark)) {
      // Tell Redis too, for the other instances; it may still be down.
      await this.markInRedis(mark).catch(() => undefined);
      return null;
    }
    const claimedAt = this.pending.get(mark);
    if (claimedAt !== undefined && now - claimedAt < this.pendingMs) {
      return null;
    }
    // Before any await: an overlapping check sees the claim.
    this.pending.set(mark, now);

    try {
      if (this.redis && (await this.redis.exists(mark)) > 0) {
        // Sent today by another instance, or before a restart.
        this.pending.delete(mark);
        this.sent.add(mark);
        return null;
      }
    } catch {
      // Redis does not answer: this instance's own record decides.
    }

    let settled = false;
    return {
      delivered: async () => {
        if (settled) return;
        settled = true;
        this.pending.delete(mark);
        this.sent.add(mark);
        await this.markInRedis(mark).catch(() => undefined);
      },
      failed: () => {
        if (settled) return;
        settled = true;
        this.pending.delete(mark);
      },
    };
  }

  private forgetOtherDays(day: string): void {
    for (const mark of this.sent) {
      if (!mark.endsWith(`:${day}`)) this.sent.delete(mark);
    }
    for (const mark of this.pending.keys()) {
      if (!mark.endsWith(`:${day}`)) this.pending.delete(mark);
    }
  }

  private async markInRedis(mark: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(mark, '1', 'EX', MARK_TTL_SECONDS);
  }
}
