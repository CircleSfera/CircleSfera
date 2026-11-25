import { describe, expect, it, vi } from 'vitest';
import {
  ALERT_PENDING_MS,
  DailyAlertGate,
  utcDay,
} from './daily-alert-gate.js';

const DAY = '2026-11-25';
const T0 = Date.UTC(2026, 10, 25, 8);

function fakeRedis() {
  const keys = new Set<string>();
  const state = { down: false };
  const fail = () => {
    if (state.down) throw new Error('redis down');
  };
  return {
    keys,
    state,
    set: vi.fn(async (key: string) => {
      fail();
      keys.add(key);
      return 'OK';
    }),
    exists: vi.fn(async (key: string) => {
      fail();
      return keys.has(key) ? 1 : 0;
    }),
  };
}

describe('DailyAlertGate', () => {
  it('lets a key out once a day, once it was delivered', async () => {
    const redis = fakeRedis();
    const gate = new DailyAlertGate(redis as never, 'p');

    const claim = await gate.claim('k', DAY, T0);
    expect(claim).not.toBeNull();
    await claim?.delivered();
    expect(redis.keys.has('p:k:2026-11-25')).toBe(true);
    expect(await gate.claim('k', DAY, T0 + 1)).toBeNull();
    expect(await gate.claim('other', DAY, T0)).not.toBeNull();
    expect(await gate.claim('k', '2026-11-26', T0)).not.toBeNull();
  });

  it('frees a key whose delivery failed, and settles a claim once', async () => {
    const redis = fakeRedis();
    const gate = new DailyAlertGate(redis as never, 'p');

    const claim = await gate.claim('k', DAY, T0);
    claim?.failed();
    await claim?.delivered(); // too late: already settled
    expect(redis.keys.size).toBe(0);
    expect(await gate.claim('k', DAY, T0 + 1)).not.toBeNull();
  });

  it('holds a claimed key until it is settled, or for a while', async () => {
    const gate = new DailyAlertGate(undefined, 'p', 1000);

    expect(await gate.claim('k', DAY, T0)).not.toBeNull();
    expect(await gate.claim('k', DAY, T0 + 999)).toBeNull();
    expect(await gate.claim('k', DAY, T0 + 1000)).not.toBeNull();
    expect(ALERT_PENDING_MS).toBe(120_000);
  });

  it('remembers in memory without Redis, and writes the mark once Redis is back', async () => {
    const redis = fakeRedis();
    redis.state.down = true;
    const gate = new DailyAlertGate(redis as never, 'p');

    await (await gate.claim('k', DAY, T0))?.delivered();
    expect(redis.keys.size).toBe(0);

    redis.state.down = false;
    expect(await gate.claim('k', DAY, T0 + 1)).toBeNull();
    expect(redis.keys.has('p:k:2026-11-25')).toBe(true);
  });

  it('works with no Redis at all', async () => {
    const gate = new DailyAlertGate(undefined, 'p');

    await (await gate.claim('k', DAY, T0))?.delivered();
    expect(await gate.claim('k', DAY, T0 + 1)).toBeNull();
    expect(await gate.claim('k', '2026-11-26', T0)).not.toBeNull();
  });

  it('names the UTC day of a moment', () => {
    expect(utcDay(new Date('2026-11-25T23:30:00-02:00'))).toBe('2026-11-26');
  });
});
