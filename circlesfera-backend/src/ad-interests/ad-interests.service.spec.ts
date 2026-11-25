import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AD_INTEREST_TOPICS,
  AD_INTERESTS_FLAG,
  AD_INTERESTS_MAX,
  ErrorCode,
} from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdInterestsService, isInterestSet } from './ad-interests.service.js';

const ADULT = new Date('1990-01-15T00:00:00Z');
// A date of birth that turns 18 tomorrow: still 17 today.
const seventeen = () => {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear() - 18, d.getUTCMonth(), d.getUTCDate() + 1),
  );
};
const UPDATED = new Date('2026-12-01T10:00:00Z');

const prisma = {
  user: { findUnique: vi.fn() },
  adInterests: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
};
const experiments = { isFeatureEnabled: vi.fn() };

const refusedWith = (errorCode: ErrorCode) => ({
  response: expect.objectContaining({ errorCode }),
});

describe('AdInterestsService (PD-084)', () => {
  let service: AdInterestsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ dateOfBirth: ADULT });
    prisma.adInterests.findUnique.mockResolvedValue(null);
    experiments.isFeatureEnabled.mockResolvedValue(true);
    service = new AdInterestsService(prisma as never, experiments as never);
  });

  describe('isInterestSet', () => {
    it('takes topics of the list, none twice, up to the most', () => {
      expect(isInterestSet([])).toBe(true);
      expect(isInterestSet(['travel', 'music'])).toBe(true);
      expect(isInterestSet(AD_INTEREST_TOPICS.slice(0, AD_INTERESTS_MAX))).toBe(
        true,
      );
    });

    it('refuses an unknown key, `other`, a repeated topic and more than the most', () => {
      expect(isInterestSet(['politics'])).toBe(false);
      expect(isInterestSet(['other'])).toBe(false);
      expect(isInterestSet(['travel', 'travel'])).toBe(false);
      expect(
        isInterestSet(AD_INTEREST_TOPICS.slice(0, AD_INTERESTS_MAX + 1)),
      ).toBe(false);
    });
  });

  describe('status', () => {
    it('shows what the person chose, in the order of the list, and that they may choose', async () => {
      prisma.adInterests.findUnique.mockResolvedValue({
        topics: ['travel', 'music'],
        updatedAt: UPDATED,
      });

      await expect(service.status('u1')).resolves.toEqual({
        interests: ['music', 'travel'],
        maxInterests: AD_INTERESTS_MAX,
        allowed: true,
        dateOfBirthMissing: false,
        updatedAt: UPDATED.toISOString(),
      });
      // Only the person's own row.
      expect(prisma.adInterests.findUnique).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        select: { topics: true, updatedAt: true },
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
    });

    it('shows none chosen as an empty list', async () => {
      await expect(service.status('u1')).resolves.toMatchObject({
        interests: [],
        updatedAt: null,
      });
    });

    it('tells someone under 18 or without a date of birth that they may not choose', async () => {
      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: seventeen() });
      await expect(service.status('u1')).resolves.toMatchObject({
        allowed: false,
        dateOfBirthMissing: false,
      });

      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: null });
      await expect(service.status('u1')).resolves.toMatchObject({
        allowed: false,
        dateOfBirthMissing: true,
      });
    });
  });

  describe('choose', () => {
    it('stores the set chosen for the person, in the order of the list', async () => {
      prisma.adInterests.findUnique.mockResolvedValue({
        topics: ['music', 'travel'],
        updatedAt: UPDATED,
      });

      const status = await service.choose('u1', ['travel', 'music']);

      expect(prisma.adInterests.upsert).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        create: { userId: 'u1', topics: ['music', 'travel'] },
        update: { topics: ['music', 'travel'] },
      });
      expect(experiments.isFeatureEnabled).toHaveBeenCalledWith(
        AD_INTERESTS_FLAG,
        'u1',
      );
      expect(status.interests).toEqual(['music', 'travel']);
    });

    it('clears every interest with an empty set, and keeps no row', async () => {
      await service.choose('u1', []);

      expect(prisma.adInterests.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prisma.adInterests.upsert).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown key', ['politics']],
      ['`other`', ['other']],
      ['a repeated topic', ['travel', 'travel']],
      ['more than the most', AD_INTEREST_TOPICS.slice(0, AD_INTERESTS_MAX + 1)],
    ])('refuses %s and stores nothing', async (_case, topics) => {
      await expect(service.choose('u1', topics)).rejects.toMatchObject(
        refusedWith(ErrorCode.AD_INTERESTS_INVALID),
      );
      expect(prisma.adInterests.upsert).not.toHaveBeenCalled();
      expect(prisma.adInterests.deleteMany).not.toHaveBeenCalled();
    });

    it('takes nothing while the flag is off, not even a clear', async () => {
      experiments.isFeatureEnabled.mockResolvedValue(false);

      for (const topics of [['travel'], []]) {
        await expect(service.choose('u1', topics)).rejects.toMatchObject(
          refusedWith(ErrorCode.FEATURE_DISABLED),
        );
      }
      expect(prisma.adInterests.upsert).not.toHaveBeenCalled();
      expect(prisma.adInterests.deleteMany).not.toHaveBeenCalled();
    });

    it('stores no interest for someone under 18, and says so', async () => {
      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: seventeen() });

      await expect(service.choose('u1', ['travel'])).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: ErrorCode.AD_INTERESTS_UNDER_AGE,
          details: { minAge: 18, dateOfBirthMissing: false },
        }),
      });
      expect(prisma.adInterests.upsert).not.toHaveBeenCalled();
    });

    it('stores no interest for an account without a date of birth, and says why', async () => {
      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: null });

      await expect(service.choose('u1', ['travel'])).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: ErrorCode.AD_INTERESTS_UNDER_AGE,
          details: { minAge: 18, dateOfBirthMissing: true },
        }),
      });
      expect(prisma.adInterests.upsert).not.toHaveBeenCalled();
    });

    it('lets someone under 18 clear interests stored before', async () => {
      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: seventeen() });

      await service.choose('u1', []);

      expect(prisma.adInterests.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });
  });

  it('is erased with the account', () => {
    const schema = readFileSync(
      join(import.meta.dirname, '../../prisma/schema.prisma'),
      'utf8',
    );
    const model =
      /\nmodel AdInterests \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';
    const userRelation =
      model.split('\n').find((line) => /^\s*user\s/.test(line)) ?? '';

    // One row per person, gone when the User row goes (deleteScheduledUser
    // deletes it).
    expect(model).toMatch(/^\s*userId\s+String\s+@id\b/m);
    expect(userRelation).toContain('references: [id]');
    expect(userRelation).toContain('onDelete: Cascade');
  });

  describe('interestsForAds', () => {
    beforeEach(() => {
      prisma.adInterests.findUnique.mockResolvedValue({
        topics: ['travel', 'music'],
        updatedAt: UPDATED,
      });
    });

    it('gives an adult’s chosen interests while the flag is on', async () => {
      await expect(service.interestsForAds('u1')).resolves.toEqual([
        'music',
        'travel',
      ]);
    });

    it('gives none while the flag is off', async () => {
      experiments.isFeatureEnabled.mockResolvedValue(false);

      await expect(service.interestsForAds('u1')).resolves.toEqual([]);
    });

    it('gives none for someone under 18 or without a date of birth, whatever is stored', async () => {
      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: seventeen() });
      await expect(service.interestsForAds('u1')).resolves.toEqual([]);

      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: null });
      await expect(service.interestsForAds('u1')).resolves.toEqual([]);
    });

    it('gives none for someone who chose none', async () => {
      prisma.adInterests.findUnique.mockResolvedValue(null);

      await expect(service.interestsForAds('u1')).resolves.toEqual([]);
    });
  });
});
