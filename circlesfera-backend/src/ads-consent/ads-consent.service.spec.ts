import {
  AD_CONSENT_TEXT_VERSION,
  ADS_CONSENT_FLAG,
  ErrorCode,
} from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdsConsentService, shouldAsk } from './ads-consent.service.js';

const ADULT = new Date('1990-01-15T00:00:00Z');
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
// A date of birth that turns 18 tomorrow: still 17 today.
const seventeen = () => {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear() - 18, d.getUTCMonth(), d.getUTCDate() + 1),
  );
};

const prisma = {
  user: { findUnique: vi.fn() },
  adConsent: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
};
const experiments = { isFeatureEnabled: vi.fn() };

const answer = (choice: 'PERSONALISED' | 'GENERAL') => ({
  choice,
  textVersion: AD_CONSENT_TEXT_VERSION,
  locale: 'es' as const,
  source: 'PROMPT' as const,
});

describe('AdsConsentService (PD-084)', () => {
  let service: AdsConsentService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ dateOfBirth: ADULT });
    prisma.adConsent.findFirst.mockResolvedValue(null);
    experiments.isFeatureEnabled.mockResolvedValue(true);
    service = new AdsConsentService(prisma as never, experiments as never);
  });

  describe('status', () => {
    it('has no default choice: an adult who never answered is asked, and gets general ads meanwhile', async () => {
      await expect(service.status('u1')).resolves.toEqual({
        choice: null,
        decidedAt: null,
        textVersion: null,
        currentTextVersion: AD_CONSENT_TEXT_VERSION,
        personalisationAllowed: true,
        effectiveChoice: 'GENERAL',
        askNow: true,
      });
      expect(experiments.isFeatureEnabled).toHaveBeenCalledWith(
        ADS_CONSENT_FLAG,
        'u1',
      );
    });

    it('asks nobody while the flag is off', async () => {
      experiments.isFeatureEnabled.mockResolvedValue(false);

      const status = await service.status('u1');

      expect(status.askNow).toBe(false);
      expect(status.choice).toBeNull();
    });

    it('never asks someone under 18, and their answer is always general', async () => {
      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: seventeen() });
      // Even a yes on record (a date of birth corrected by an identity
      // check) does not apply.
      prisma.adConsent.findFirst.mockResolvedValue({
        choice: 'PERSONALISED',
        textVersion: AD_CONSENT_TEXT_VERSION,
        createdAt: daysAgo(3),
      });

      const status = await service.status('u1');

      expect(status).toMatchObject({
        askNow: false,
        personalisationAllowed: false,
        effectiveChoice: 'GENERAL',
      });
      await expect(service.allowsPersonalisedAds('u1')).resolves.toBe(false);
    });

    it('treats an account without a date of birth as under 18', async () => {
      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: null });

      const status = await service.status('u1');

      expect(status.askNow).toBe(false);
      expect(status.personalisationAllowed).toBe(false);
    });

    it('does not ask again once answered to the texts in force', async () => {
      prisma.adConsent.findFirst.mockResolvedValue({
        choice: 'GENERAL',
        textVersion: AD_CONSENT_TEXT_VERSION,
        createdAt: daysAgo(400),
      });

      const status = await service.status('u1');

      expect(status).toMatchObject({
        choice: 'GENERAL',
        textVersion: AD_CONSENT_TEXT_VERSION,
        askNow: false,
      });
    });

    it('reads the latest answer of the person', async () => {
      await service.status('u1');

      expect(prisma.adConsent.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { choice: true, textVersion: true, createdAt: true },
      });
    });
  });

  describe('shouldAsk: no repeated asking for 6 months after a no', () => {
    const now = new Date('2027-08-15T12:00:00Z');
    const old = 'old-texts';

    it('does not ask again within 6 months of a no, even when the texts changed', () => {
      expect(
        shouldAsk(
          {
            choice: 'GENERAL',
            textVersion: old,
            createdAt: new Date('2027-02-16T12:00:00Z'),
          },
          true,
          now,
        ),
      ).toBe(false);
    });

    it('may ask again about new texts once 6 months have passed since the no', () => {
      expect(
        shouldAsk(
          {
            choice: 'GENERAL',
            textVersion: old,
            createdAt: new Date('2027-02-15T12:00:00Z'),
          },
          true,
          now,
        ),
      ).toBe(true);
    });

    it('asks again about new texts someone who said yes to the old ones', () => {
      expect(
        shouldAsk(
          { choice: 'PERSONALISED', textVersion: old, createdAt: now },
          true,
          now,
        ),
      ).toBe(true);
    });

    it('never asks again about the same texts', () => {
      expect(
        shouldAsk(
          {
            choice: 'GENERAL',
            textVersion: AD_CONSENT_TEXT_VERSION,
            createdAt: new Date('2020-01-01T00:00:00Z'),
          },
          true,
          now,
        ),
      ).toBe(false);
    });
  });

  describe('answer', () => {
    it('stores the choice with the version and language of the texts shown, as a new row', async () => {
      prisma.adConsent.findFirst.mockResolvedValue({
        choice: 'PERSONALISED',
        textVersion: AD_CONSENT_TEXT_VERSION,
        createdAt: new Date(),
      });

      const status = await service.answer('u1', answer('PERSONALISED'));

      expect(prisma.adConsent.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          choice: 'PERSONALISED',
          textVersion: AD_CONSENT_TEXT_VERSION,
          locale: 'es',
          source: 'PROMPT',
        },
      });
      // A proof is never rewritten.
      expect(prisma.adConsent.update).not.toHaveBeenCalled();
      expect(status.effectiveChoice).toBe('PERSONALISED');
      expect(status.askNow).toBe(false);
    });

    it('withdraws as easily as it gives: a general answer after a yes applies at once', async () => {
      prisma.adConsent.findFirst.mockResolvedValue({
        choice: 'GENERAL',
        textVersion: AD_CONSENT_TEXT_VERSION,
        createdAt: new Date(),
      });

      const status = await service.answer('u1', {
        ...answer('GENERAL'),
        source: 'SETTINGS',
      });

      expect(prisma.adConsent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          choice: 'GENERAL',
          source: 'SETTINGS',
        }),
      });
      expect(status.effectiveChoice).toBe('GENERAL');
      await expect(service.allowsPersonalisedAds('u1')).resolves.toBe(false);
    });

    it('refuses personalised ads for someone under 18 and stores nothing', async () => {
      prisma.user.findUnique.mockResolvedValue({ dateOfBirth: seventeen() });

      await expect(
        service.answer('u1', answer('PERSONALISED')),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: ErrorCode.AD_PERSONALISATION_UNDER_AGE,
        }),
      });
      expect(prisma.adConsent.create).not.toHaveBeenCalled();
    });

    it('refuses an answer given to texts that are no longer in force', async () => {
      await expect(
        service.answer('u1', { ...answer('PERSONALISED'), textVersion: 'old' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: ErrorCode.AD_CONSENT_TEXT_OUTDATED,
        }),
      });
      expect(prisma.adConsent.create).not.toHaveBeenCalled();
    });
  });

  describe('allowsPersonalisedAds', () => {
    it('is true only for an adult whose last answer was yes to the texts in force', async () => {
      prisma.adConsent.findFirst.mockResolvedValue({
        choice: 'PERSONALISED',
        textVersion: AD_CONSENT_TEXT_VERSION,
        createdAt: new Date(),
      });
      await expect(service.allowsPersonalisedAds('u1')).resolves.toBe(true);

      prisma.adConsent.findFirst.mockResolvedValue({
        choice: 'PERSONALISED',
        textVersion: 'old',
        createdAt: new Date(),
      });
      await expect(service.allowsPersonalisedAds('u1')).resolves.toBe(false);

      prisma.adConsent.findFirst.mockResolvedValue(null);
      await expect(service.allowsPersonalisedAds('u1')).resolves.toBe(false);
    });
  });
});
