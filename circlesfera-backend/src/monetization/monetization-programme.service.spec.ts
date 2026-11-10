import { ErrorCode } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MonetizationProgrammeService } from './monetization-programme.service.js';

// An adult whose identity a document verified, who may charge.
const ADULT = {
  identityVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  dateOfBirth: new Date('1990-05-01T00:00:00.000Z'),
  dateOfBirthVerified: true,
};

const prisma = {
  profile: { findFirst: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
};
const service = new MonetizationProgrammeService(prisma as never);

const creator = (over: object = {}) => ({
  accountType: 'CREATOR',
  isAccountBanned: false,
  suspendedUntil: null,
  ...over,
});
const status = {
  monetizationStatus: 'PENDING',
  monetizationAppliedAt: new Date('2026-11-10T10:00:00.000Z'),
  monetizationReviewedAt: null,
  monetizationNote: null,
};

describe('MonetizationProgrammeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(ADULT);
    prisma.profile.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('statusOf', () => {
    it('says where the Profile stands, only for its own person', async () => {
      prisma.profile.findFirst.mockResolvedValueOnce({
        ...status,
        monetizationStatus: 'REJECTED',
        monetizationNote: 'Too little activity yet',
      });

      await expect(service.statusOf('u1', 'p1')).resolves.toEqual({
        status: 'REJECTED',
        appliedAt: status.monetizationAppliedAt,
        reviewedAt: null,
        note: 'Too little activity yet',
      });
      expect(prisma.profile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1', userId: 'u1' } }),
      );
    });

    it('finds no Profile of someone else', async () => {
      prisma.profile.findFirst.mockResolvedValueOnce(null);
      await expect(service.statusOf('u1', 'p-other')).rejects.toMatchObject({
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
    });
  });

  describe('apply', () => {
    const pitch = '  Photography tutorials and behind the scenes  ';

    it('puts the application in, from a status that allows it, and says so', async () => {
      prisma.profile.findFirst
        .mockResolvedValueOnce(creator())
        .mockResolvedValueOnce(status);

      await expect(service.apply('u1', 'p1', pitch)).resolves.toMatchObject({
        status: 'PENDING',
      });
      expect(prisma.profile.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'p1',
          userId: 'u1',
          monetizationStatus: { in: ['NONE', 'REJECTED', 'REVOKED'] },
        },
        data: {
          monetizationStatus: 'PENDING',
          monetizationAppliedAt: expect.any(Date),
          monetizationPitch: 'Photography tutorials and behind the scenes',
          monetizationNote: null,
        },
      });
    });

    it('finds no Profile of someone else', async () => {
      prisma.profile.findFirst.mockResolvedValueOnce(null);
      await expect(service.apply('u1', 'p1', pitch)).rejects.toMatchObject({
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
    });

    it('takes no application from a personal Profile', async () => {
      prisma.profile.findFirst.mockResolvedValueOnce(
        creator({ accountType: 'PERSONAL' }),
      );
      await expect(service.apply('u1', 'p1', pitch)).rejects.toMatchObject({
        errorCode: ErrorCode.ACCOUNT_TYPE_NOT_ELIGIBLE_FOR_MONETIZATION,
      });
      expect(prisma.profile.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ['banned', { isAccountBanned: true }],
      ['suspended', { suspendedUntil: new Date(Date.now() + 60_000) }],
    ])('takes no application from a Profile %s', async (_c, over) => {
      prisma.profile.findFirst.mockResolvedValueOnce(creator(over));
      await expect(service.apply('u1', 'p1', pitch)).rejects.toMatchObject({
        errorCode: ErrorCode.MONETIZATION_APPLICATION_NOT_OPEN,
      });
    });

    it('takes an application once a suspension is over', async () => {
      prisma.profile.findFirst
        .mockResolvedValueOnce(
          creator({ suspendedUntil: new Date(Date.now() - 60_000) }),
        )
        .mockResolvedValueOnce(status);
      await expect(service.apply('u1', 'p1', pitch)).resolves.toMatchObject({
        status: 'PENDING',
      });
    });

    it('takes no application from someone under 18', async () => {
      prisma.profile.findFirst.mockResolvedValueOnce(creator());
      prisma.user.findUnique.mockResolvedValueOnce({
        ...ADULT,
        dateOfBirth: new Date(new Date().getFullYear() - 17, 0, 1),
      });
      await expect(service.apply('u1', 'p1', pitch)).rejects.toMatchObject({
        errorCode: ErrorCode.MONETIZATION_UNDER_AGE,
      });
    });

    it('says so when the Profile already applied or is approved', async () => {
      prisma.profile.findFirst.mockResolvedValueOnce(creator());
      prisma.profile.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.apply('u1', 'p1', pitch)).rejects.toMatchObject({
        errorCode: ErrorCode.MONETIZATION_APPLICATION_NOT_OPEN,
      });
    });
  });
});
