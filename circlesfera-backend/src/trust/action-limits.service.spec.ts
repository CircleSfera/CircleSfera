import { ErrorCode } from '@circlesfera/shared';
import { HttpStatus } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { FakeRedis } from '../common/testing/fake-redis.js';
import { ActionLimitsService, trustKeys } from './action-limits.service.js';
import type { LimitedAction } from './trust.constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Start of an hour, so fixed windows do not roll over during a test.
const NOW = new Date('2026-10-05T10:00:00.000Z');
const OLD_ACCOUNT = new Date(NOW.getTime() - 30 * DAY_MS);
const NEW_ACCOUNT = new Date(NOW.getTime() - 2 * DAY_MS);

describe('ActionLimitsService', () => {
  let redis: FakeRedis;
  let prisma: { profile: { findUnique: ReturnType<typeof vi.fn> } };
  let hash: { hash: ReturnType<typeof vi.fn> };
  let service: ActionLimitsService;
  let trigger: ReturnType<typeof vi.fn<(profileId: string) => void>>;

  const createdAt = (date: Date) =>
    prisma.profile.findUnique.mockResolvedValue({ user: { createdAt: date } });

  const consumeTimes = async (n: number, action: LimitedAction = 'follow') => {
    for (let i = 0; i < n; i++) await service.consume('p-1', action);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    redis = new FakeRedis();
    prisma = { profile: { findUnique: vi.fn() } };
    createdAt(OLD_ACCOUNT);
    hash = { hash: vi.fn((v: string) => `h(${v.length})`) };
    service = new ActionLimitsService(
      redis as never,
      prisma as never,
      hash as never,
    );
    trigger = vi.fn<(profileId: string) => void>();
    service.onEvaluationNeeded(trigger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows follows up to the hourly cap and refuses the next one with a retry time', async () => {
    await consumeTimes(120);

    const error = await service.consume('p-1', 'follow').catch((e) => e);

    expect(error).toBeInstanceOf(AppException);
    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(error.getResponse()).toMatchObject({
      errorCode: ErrorCode.ACTION_LIMIT_REACHED,
      details: { action: 'follow', retryAt: '2026-10-05T11:00:00.000Z' },
    });
  });

  it('a refused action does not count', async () => {
    await consumeTimes(120);
    await service.consume('p-1', 'follow').catch(() => {});
    await service.consume('p-1', 'follow').catch(() => {});

    const hourBucket = Math.floor(NOW.getTime() / 1000 / 3600);
    const key = trustKeys.counter(
      'follow',
      { name: '1h', seconds: 3600, limit: 120 },
      'p-1',
      hourBucket,
    );
    expect(await redis.get(key)).toBe('120');
  });

  it('halves the caps for accounts younger than 7 days', async () => {
    createdAt(NEW_ACCOUNT);
    await consumeTimes(60);

    await expect(service.consume('p-1', 'follow')).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('lowers the daily caps while a protective restriction is active', async () => {
    await service.setRestricted('p-1', new Date(NOW.getTime() + DAY_MS));
    await consumeTimes(5, 'message_request');

    await expect(
      service.consume('p-1', 'message_request'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('the restriction ends when it is cleared', async () => {
    await service.setRestricted('p-1', new Date(NOW.getTime() + DAY_MS));
    await service.clearRestricted('p-1');
    await consumeTimes(6, 'message_request');
  });

  it('asks for an evaluation when follows exceed 40 in 10 minutes', async () => {
    await consumeTimes(40);
    expect(trigger).not.toHaveBeenCalled();

    await service.consume('p-1', 'follow');
    expect(trigger).toHaveBeenCalledWith('p-1');
  });

  it('lets the action through when Redis is unavailable', async () => {
    redis.failing = true;
    await expect(service.consume('p-1', 'follow')).resolves.toBeUndefined();
  });

  it('counts every allowed action as a write for the day and marks the Profile active', async () => {
    await consumeTimes(3, 'comment');
    const signals = await service.readSignals('p-1');
    expect(signals.writesToday).toBe(3);
    expect(await service.recentlyActiveProfiles()).toEqual(['p-1']);
  });

  describe('recordText', () => {
    const spam = 'Click here to win a free phone today!!';

    it('ignores short texts', async () => {
      for (let i = 0; i < 10; i++) await service.recordText('p-1', 'gracias!');
      expect(hash.hash).not.toHaveBeenCalled();
      expect((await service.readSignals('p-1')).repeatedText).toBe(0);
    });

    it('flags the same text sent 5 times by one Profile', async () => {
      for (let i = 0; i < 4; i++) await service.recordText('p-1', spam);
      expect((await service.readSignals('p-1')).repeatedText).toBe(0);

      await service.recordText('p-1', `  ${spam.toUpperCase()} `);
      expect((await service.readSignals('p-1')).repeatedText).toBe(5);
      expect(trigger).toHaveBeenCalledWith('p-1');
    });

    it('flags every Profile when 3 different Profiles send the same text', async () => {
      await service.recordText('p-1', spam);
      await service.recordText('p-2', spam);
      await service.recordText('p-3', spam);

      for (const id of ['p-1', 'p-2', 'p-3']) {
        expect((await service.readSignals(id)).coordinatedText).toBe(3);
        expect(trigger).toHaveBeenCalledWith(id);
      }
    });

    it('stores only the keyed hash, never the text', async () => {
      await service.recordText('p-1', spam);
      expect(redis.keys().some((k) => k.includes('free phone'))).toBe(false);
      expect(hash.hash).toHaveBeenCalledWith(spam.toLowerCase());
    });
  });

  it('takes the evaluation lock once per minute', async () => {
    expect(await service.tryEvaluationLock('p-1')).toBe(true);
    expect(await service.tryEvaluationLock('p-1')).toBe(false);
    vi.setSystemTime(new Date(NOW.getTime() + 61_000));
    expect(await service.tryEvaluationLock('p-1')).toBe(true);
  });
});
