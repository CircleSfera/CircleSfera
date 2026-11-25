import { describe, expect, it, vi } from 'vitest';
import { DailyAlertGate, utcDay } from './daily-alert-gate.js';

describe('DailyAlertGate', () => {
  it('lets a key through once a day with Redis', async () => {
    const keys = new Set<string>();
    const gate = new DailyAlertGate(
      {
        set: vi.fn(async (key: string) => {
          if (keys.has(key)) return null;
          keys.add(key);
          return 'OK';
        }),
      } as never,
      'p',
    );

    expect(await gate.firstToday('k', '2026-11-25')).toBe(true);
    expect(await gate.firstToday('k', '2026-11-25')).toBe(false);
    expect(await gate.firstToday('other', '2026-11-25')).toBe(true);
    expect(await gate.firstToday('k', '2026-11-26')).toBe(true);
    expect(keys.has('p:k:2026-11-25')).toBe(true);
  });

  it('remembers in memory without Redis at all', async () => {
    const gate = new DailyAlertGate(undefined, 'p');

    expect(await gate.firstToday('k', '2026-11-25')).toBe(true);
    expect(await gate.firstToday('k', '2026-11-25')).toBe(false);
    expect(await gate.firstToday('k', '2026-11-26')).toBe(true);
  });

  it('names the UTC day of a moment', () => {
    expect(utcDay(new Date('2026-11-25T23:30:00-02:00'))).toBe('2026-11-26');
  });
});
