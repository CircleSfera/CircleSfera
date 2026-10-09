import { describe, expect, it } from 'vitest';
import { shortDuration, targetState } from './ticketTarget';

const HOUR = 3_600_000;
const START = Date.parse('2026-03-01T00:00:00Z');
const at = (hours: number) => new Date(START + hours * HOUR).toISOString();
const ticket = (overrides: Record<string, unknown> = {}) => ({
  status: 'OPEN',
  createdAt: at(0),
  firstResponseDueAt: at(24),
  firstRespondedAt: null,
  resolutionDueAt: at(72),
  ...overrides,
});
const state = (t: ReturnType<typeof ticket>, hours: number) =>
  targetState(t, START + hours * HOUR);

describe('where a ticket stands against its targets', () => {
  it('watches the first response until an agent answers', () => {
    expect(state(ticket(), 17)).toBeNull();
    // A quarter of 24 hours is left at hour 18.
    expect(state(ticket(), 18)).toEqual({
      state: 'near',
      target: 'first_response',
      ms: 6 * HOUR,
    });
    expect(state(ticket(), 24)).toMatchObject({ state: 'near', ms: 0 });
    expect(state(ticket(), 27)).toEqual({
      state: 'past',
      target: 'first_response',
      ms: 3 * HOUR,
    });
  });

  it('watches the resolution once the ticket was answered', () => {
    const answered = ticket({ firstRespondedAt: at(2) });

    expect(state(answered, 30)).toBeNull();
    expect(state(answered, 54)).toEqual({
      state: 'near',
      target: 'resolution',
      ms: 18 * HOUR,
    });
    expect(state(answered, 80)).toEqual({
      state: 'past',
      target: 'resolution',
      ms: 8 * HOUR,
    });
  });

  it('shows nothing for a ticket whose clock is stopped or that is finished', () => {
    for (const status of ['WAITING', 'ESCALATED', 'RESOLVED', 'CLOSED']) {
      expect(state(ticket({ status }), 500)).toBeNull();
    }
  });

  it('shows nothing for a ticket that is not measured', () => {
    expect(
      state(ticket({ firstResponseDueAt: null, resolutionDueAt: null }), 500),
    ).toBeNull();
    expect(
      state(
        ticket({ firstResponseDueAt: undefined, resolutionDueAt: undefined }),
        500,
      ),
    ).toBeNull();
    // Answered, with no resolution target.
    expect(
      state(ticket({ firstRespondedAt: at(1), resolutionDueAt: null }), 500),
    ).toBeNull();
    expect(
      state(
        ticket({ resolutionDueAt: 'not a date', firstRespondedAt: at(1) }),
        500,
      ),
    ).toBeNull();
  });

  it('falls back to the resolution when there is no first response target', () => {
    expect(state(ticket({ firstResponseDueAt: null }), 80)).toMatchObject({
      state: 'past',
      target: 'resolution',
    });
  });

  it('writes a length of time in the largest unit that fits', () => {
    expect(shortDuration(0)).toBe('1 min');
    expect(shortDuration(59 * 60_000)).toBe('59 min');
    expect(shortDuration(HOUR)).toBe('1 h');
    expect(shortDuration(47 * HOUR)).toBe('47 h');
    expect(shortDuration(48 * HOUR)).toBe('2 d');
    expect(shortDuration(200 * HOUR)).toBe('8 d');
  });
});
