import { ApiErrorCode } from '@circlesfera/shared';
import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbuseHashService } from './abuse-hash.service.js';
import {
  assertEmailVerifiedForWrite,
  emailNotVerifiedForbidden,
} from './assert-email-verified.js';
import { DeviceSignalService } from './device-signal.service.js';
import { linkedAccountsWhere } from './linked-accounts.js';
import {
  accountStanding,
  computeTrustScore,
  lastActiveBucket,
} from './trust-score.js';
import {
  EMAIL_FORBIDDEN_CACHE_KEY,
  TURNSTILE_FAIL_CACHE_KEY,
  TurnstileService,
} from './turnstile.service.js';

const config = (values: Record<string, string | undefined>) => ({
  get: (key: string) => values[key],
});

describe('AbuseHashService', () => {
  it('hashes with the pepper and never returns the input', () => {
    const service = new AbuseHashService(
      config({ ABUSE_HASH_PEPPER: 'a-real-pepper-value' }) as never,
    );
    const hash = service.hash(' 203.0.113.9 ');

    expect(service.isConfigured()).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(service.hash('203.0.113.9'));
    expect(hash).not.toContain('203');
  });

  it('returns null for an empty value', () => {
    const service = new AbuseHashService(
      config({ ABUSE_HASH_PEPPER: 'a-real-pepper-value' }) as never,
    );
    expect(service.hash('')).toBeNull();
    expect(service.hash(null)).toBeNull();
  });

  it('refuses placeholder or missing peppers', () => {
    for (const pepper of [undefined, '', 'CHANGE_ME', 'dummy-pepper']) {
      const service = new AbuseHashService(
        config({ ABUSE_HASH_PEPPER: pepper }) as never,
      );
      expect(service.isConfigured()).toBe(false);
      expect(service.hash('203.0.113.9')).toBeNull();
    }
  });
});

describe('assertEmailVerifiedForWrite', () => {
  const prisma = { user: { findUnique: vi.fn() } };
  const settings = { isEnabled: vi.fn() };
  const turnstile = { incrementEmailForbidden: vi.fn() };
  const run = () =>
    assertEmailVerifiedForWrite(
      prisma as never,
      settings as never,
      turnstile as never,
      'u-1',
    );

  beforeEach(() => {
    vi.clearAllMocks();
    settings.isEnabled.mockResolvedValue(true);
  });

  it('does nothing when verification is not required', async () => {
    settings.isEnabled.mockResolvedValue(false);
    await expect(run()).resolves.toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('lets a verified account write', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerified: new Date() });
    await expect(run()).resolves.toBeUndefined();
  });

  it('refuses an unverified account and counts it', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerified: null });
    const error = await run().catch((e) => e);
    expect(error.getResponse()).toMatchObject({
      errorCode: 'EMAIL_NOT_VERIFIED',
    });
    expect(turnstile.incrementEmailForbidden).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy ForbiddenException shape', () => {
    expect(emailNotVerifiedForbidden().getResponse()).toEqual({
      message: 'EMAIL_NOT_VERIFIED',
    });
  });
});

describe('DeviceSignalService', () => {
  const prisma = {
    user: { update: vi.fn() },
    deviceSignal: { upsert: vi.fn() },
  };
  const hash = {
    hash: vi.fn((v: string | null | undefined) => (v ? `h:${v}` : null)),
  };
  const service = new DeviceSignalService(prisma as never, hash as never);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T10:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => vi.useRealTimers());

  it('records sign-up IP, hashes, country and the device', async () => {
    await service.recordSignup('u-1', {
      ip: '203.0.113.9',
      country: 'es',
      visitorId: 'v-1',
      userAgent: 'UA',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: {
        signupIp: '203.0.113.9',
        lastIp: '203.0.113.9',
        lastIpAt: new Date('2026-10-05T10:00:00.000Z'),
        signupIpHash: 'h:203.0.113.9',
        lastIpHash: 'h:203.0.113.9',
        signupCountry: 'ES',
      },
    });
    expect(prisma.deviceSignal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_visitorHash: { userId: 'u-1', visitorHash: 'h:v-1' } },
        create: { userId: 'u-1', visitorHash: 'h:v-1', userAgentHash: 'h:UA' },
      }),
    );
  });

  it('records the last sign-in IP and refreshes the device', async () => {
    await service.recordLogin('u-1', { ip: '198.51.100.4', visitorId: 'v-1' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: {
        lastIp: '198.51.100.4',
        lastIpAt: new Date('2026-10-05T10:00:00.000Z'),
        lastIpHash: 'h:198.51.100.4',
      },
    });
    expect(prisma.deviceSignal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { lastSeenAt: new Date('2026-10-05T10:00:00.000Z') },
      }),
    );
  });

  it('skips the device when there is no fingerprint, and junk IPs', async () => {
    await service.recordLogin('u-1', { ip: 'not-an-ip' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { lastIpHash: 'h:not-an-ip' },
    });
    expect(prisma.deviceSignal.upsert).not.toHaveBeenCalled();
  });
});

describe('linkedAccountsWhere', () => {
  it('matches other accounts by IP hashes and device hashes', () => {
    expect(
      linkedAccountsWhere({
        id: 'u-1',
        signupIpHash: 'a',
        lastIpHash: null,
        deviceSignals: [{ visitorHash: 'd' }],
      }),
    ).toEqual({
      id: { not: 'u-1' },
      OR: [
        { signupIpHash: { in: ['a'] } },
        { lastIpHash: { in: ['a'] } },
        { deviceSignals: { some: { visitorHash: { in: ['d'] } } } },
      ],
    });
  });

  it('matches by device only, or returns null with nothing to compare', () => {
    expect(
      linkedAccountsWhere({
        id: 'u-1',
        signupIpHash: null,
        lastIpHash: null,
        deviceSignals: [{ visitorHash: 'd' }],
      })?.OR,
    ).toHaveLength(1);
    expect(
      linkedAccountsWhere({
        id: 'u-1',
        signupIpHash: null,
        lastIpHash: null,
        deviceSignals: [],
      }),
    ).toBeNull();
  });
});

describe('trust score helpers', () => {
  const now = new Date('2026-10-05T10:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;

  it('buckets the last activity', () => {
    expect(lastActiveBucket(null, now)).toBe('unknown');
    expect(lastActiveBucket('not a date', now)).toBe('unknown');
    expect(lastActiveBucket(new Date(now.getTime() - 1000), now)).toBe('today');
    expect(lastActiveBucket(new Date(now.getTime() - 3 * DAY), now)).toBe(
      'week',
    );
    expect(lastActiveBucket(new Date(now.getTime() - 20 * DAY), now)).toBe(
      'month',
    );
    expect(lastActiveBucket(new Date(now.getTime() - 90 * DAY), now)).toBe(
      'older',
    );
  });

  it('reports standing from suspension and activity', () => {
    expect(
      accountStanding({
        isActive: true,
        suspendedUntil: new Date(now.getTime() + DAY),
        now,
      }),
    ).toBe('suspended');
    expect(
      accountStanding({ isActive: false, suspendedUntil: null, now }),
    ).toBe('suspended');
    expect(accountStanding({ isActive: true, suspendedUntil: null, now })).toBe(
      'ok',
    );
  });

  it('adds verification and age, subtracts strikes, bot label and clusters', () => {
    const strong = computeTrustScore({
      emailVerified: true,
      identityVerified: true,
      createdAt: new Date(now.getTime() - 60 * DAY),
      strikeCount: 0,
      botLabeled: false,
      clusterSize: 1,
      now,
    });
    expect(strong.score).toBe(95);

    const weak = computeTrustScore({
      emailVerified: false,
      identityVerified: false,
      createdAt: new Date(now.getTime() - 10 * DAY),
      strikeCount: 9,
      botLabeled: true,
      clusterSize: 4,
      now,
    });
    expect(weak.factors.map((f) => f.key)).toEqual([
      'base',
      'age7',
      'strikes',
      'bot_label',
      'cluster',
    ]);
    // 50 + 5 - 40 (capped) - 25 - 15, floored at 0.
    expect(weak.score).toBe(0);
  });
});

describe('TurnstileService verification', () => {
  const values: Record<string, string | undefined> = {};
  const settings = { isEnabled: vi.fn() };
  const store = new Map<string, unknown>();
  const cache = {
    get: vi.fn(async (k: string) => store.get(k)),
    set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
  };
  const service = new TurnstileService(
    config(values) as never,
    settings as never,
    cache as never,
  );

  beforeEach(() => {
    for (const k of Object.keys(values)) delete values[k];
    store.clear();
    vi.clearAllMocks();
    settings.isEnabled.mockResolvedValue(true);
    values.TURNSTILE_SECRET_KEY = 'secret';
  });

  afterEach(() => vi.unstubAllGlobals());

  it('is not required when switched off', async () => {
    settings.isEnabled.mockResolvedValue(false);
    expect(await service.isRequired()).toBe(false);
    await expect(service.assertValid(undefined)).resolves.toBeUndefined();
  });

  it('fails closed in production when the secret is missing', async () => {
    delete values.TURNSTILE_SECRET_KEY;
    values.NODE_ENV = 'production';
    await expect(service.isRequired()).rejects.toThrow('SECURITY ALERT');
  });

  it('is skipped outside production when the secret is missing', async () => {
    delete values.TURNSTILE_SECRET_KEY;
    values.NODE_ENV = 'development';
    expect(await service.isRequired()).toBe(false);
  });

  it('accepts a token Cloudflare confirms', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      service.assertValid('token', '203.0.113.9'),
    ).resolves.toBeUndefined();
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('remoteip')).toBe('203.0.113.9');
    expect(body.get('response')).toBe('token');
  });

  it('rejects a token Cloudflare refuses or cannot verify, and counts it', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ json: async () => ({ success: false }) })
        .mockRejectedValueOnce(new Error('network down')),
    );

    for (let i = 0; i < 2; i++) {
      const error = await service.assertValid('token').catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(ApiErrorCode.CAPTCHA_FAILED);
    }
    expect(store.get(TURNSTILE_FAIL_CACHE_KEY)).toBe(2);
  });

  it('rejects a missing token and reports the funnel counters', async () => {
    await expect(service.assertValid('  ')).rejects.toThrow(
      BadRequestException,
    );
    await service.incrementEmailForbidden();
    store.set(EMAIL_FORBIDDEN_CACHE_KEY, '4');

    expect(await service.getFunnelCounters()).toEqual({
      turnstileFailures: 1,
      emailForbidden: 4,
    });
  });
});
