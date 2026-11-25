import type { Redis } from 'ioredis';

// A day's mark outlives the day, whatever the time zone of the reader.
const MARK_TTL_SECONDS = 2 * 24 * 60 * 60;

/** The UTC day of a moment, as the marks name it: 2026-11-25. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Lets an alert through once per key per UTC day. Redis keeps the mark
 * (SET NX), so a restart or a second instance does not send it again. This
 * instance's memory keeps it while Redis does not answer, and is read first,
 * so an alert sent during an outage is not sent again once Redis is back.
 * Without Redis at all it remembers in memory only.
 */
export class DailyAlertGate {
  private readonly sentWithoutRedis = new Set<string>();

  constructor(
    private readonly redis: Pick<Redis, 'set'> | undefined,
    private readonly prefix: string,
  ) {}

  async firstToday(key: string, day: string): Promise<boolean> {
    const mark = `${this.prefix}:${key}:${day}`;
    for (const old of this.sentWithoutRedis) {
      if (!old.endsWith(`:${day}`)) this.sentWithoutRedis.delete(old);
    }
    if (this.sentWithoutRedis.has(mark)) {
      // Tell Redis too, for the other instances; it may still be down.
      await this.markInRedis(mark).catch(() => undefined);
      return false;
    }
    try {
      if (!this.redis) throw new Error('no Redis');
      return (await this.markInRedis(mark)) === 'OK';
    } catch {
      this.sentWithoutRedis.add(mark);
      return true;
    }
  }

  private async markInRedis(mark: string): Promise<string | null> {
    if (!this.redis) return null;
    return this.redis.set(mark, '1', 'EX', MARK_TTL_SECONDS, 'NX');
  }
}
