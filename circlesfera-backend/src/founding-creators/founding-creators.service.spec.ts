import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorCode } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentsService } from '../payments/payments.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  distinctLinks,
  FoundingCreatorsService,
} from './founding-creators.service.js';

describe('FoundingCreatorsService', () => {
  const creator = {
    accountType: 'CREATOR',
    user: { identityVerifiedAt: new Date('2026-11-01T00:00:00.000Z') },
  };
  const dto = {
    links: [
      'https://vimeo.com/ana',
      ' https://vimeo.com/ana ',
      'https://tiktok.com/@ana',
    ],
    city: 'Valencia',
    note: '',
  };
  let prisma: Record<string, any>;
  let payments: { startFoundingYear: ReturnType<typeof vi.fn> };
  let service: FoundingCreatorsService;

  beforeEach(() => {
    prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue(creator) },
      foundingCreatorApplication: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'app_1' }),
      },
      platformSubscription: { count: vi.fn().mockResolvedValue(0) },
    };
    payments = { startFoundingYear: vi.fn().mockResolvedValue({}) };
    service = new FoundingCreatorsService(
      prisma as unknown as PrismaService,
      payments as unknown as PaymentsService,
    );
  });

  describe('apply', () => {
    it('records the application of the owner of a Creator Profile: each link once, no empty note', async () => {
      await service.apply('u_1', 'prof_1', dto);

      // The Profile in use, and only when the person owns it.
      expect(prisma.profile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prof_1', userId: 'u_1' } }),
      );
      expect(prisma.foundingCreatorApplication.create).toHaveBeenCalledWith({
        data: {
          profileId: 'prof_1',
          links: ['https://vimeo.com/ana', 'https://tiktok.com/@ana'],
          city: 'Valencia',
          note: null,
        },
      });
    });

    it('is for Creator Profiles only', async () => {
      prisma.profile.findFirst.mockResolvedValue({
        ...creator,
        accountType: 'PERSONAL',
      });

      await expect(service.apply('u_1', 'prof_1', dto)).rejects.toMatchObject({
        errorCode: ErrorCode.FOUNDING_CREATOR_PROFILE_TYPE,
      });
      expect(prisma.foundingCreatorApplication.create).not.toHaveBeenCalled();
    });

    it('is refused to whoever does not own the Profile (a team member), as if it did not exist', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);

      await expect(service.apply('u_2', 'prof_1', dto)).rejects.toMatchObject({
        errorCode: ErrorCode.PROFILE_NOT_FOUND,
      });
      await expect(service.apply('u_2', '', dto)).rejects.toMatchObject({
        errorCode: ErrorCode.PROFILE_NOT_FOUND,
      });
      expect(prisma.profile.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: '__no_profile__', userId: 'u_2' },
        }),
      );
      expect(prisma.foundingCreatorApplication.create).not.toHaveBeenCalled();
    });

    it('keeps one open application per Profile: one waiting or approved refuses another', async () => {
      prisma.foundingCreatorApplication.findFirst.mockResolvedValue({
        id: 'app_0',
      });

      await expect(service.apply('u_1', 'prof_1', dto)).rejects.toMatchObject({
        errorCode: ErrorCode.FOUNDING_CREATOR_ALREADY_APPLIED,
      });
      expect(prisma.foundingCreatorApplication.findFirst).toHaveBeenCalledWith({
        where: {
          profileId: 'prof_1',
          status: { in: ['PENDING', 'APPROVED'] },
        },
        select: { id: true },
      });
      expect(prisma.foundingCreatorApplication.create).not.toHaveBeenCalled();
    });

    it('keeps one when two requests arrive at once: the index refuses the second', async () => {
      prisma.foundingCreatorApplication.create.mockRejectedValue(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );

      await expect(service.apply('u_1', 'prof_1', dto)).rejects.toMatchObject({
        errorCode: ErrorCode.FOUNDING_CREATOR_ALREADY_APPLIED,
      });
    });

    it('lets any other failure through', async () => {
      prisma.foundingCreatorApplication.create.mockRejectedValue(
        new Error('down'),
      );

      await expect(service.apply('u_1', 'prof_1', dto)).rejects.toThrow('down');
    });

    it('keeps a note that was written', async () => {
      await service.apply('u_1', 'prof_1', { ...dto, note: 'Editor' });

      expect(prisma.foundingCreatorApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ note: 'Editor' }),
        }),
      );
    });
  });

  describe('status', () => {
    const application = (over: Record<string, unknown> = {}) => ({
      id: 'app_1',
      status: 'APPROVED',
      platformSubscription: null,
      ...over,
    });

    it('shows nothing of the Profile to whoever does not own it', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);

      expect(await service.status('u_2', 'prof_1')).toEqual({
        isOwner: false,
        isCreator: false,
        identityVerified: false,
        application: null,
        freeYear: null,
      });
      expect(
        prisma.foundingCreatorApplication.findFirst,
      ).not.toHaveBeenCalled();
    });

    it('shows the latest application, a decline with its reason, never who decided', async () => {
      prisma.foundingCreatorApplication.findFirst.mockResolvedValue(
        application({ status: 'DECLINED', declineReason: 'NOT_VIDEO_WORK' }),
      );

      const res = await service.status('u_1', 'prof_1');

      expect(res).toMatchObject({
        isOwner: true,
        isCreator: true,
        identityVerified: true,
        application: { status: 'DECLINED', declineReason: 'NOT_VIDEO_WORK' },
        freeYear: null,
      });
      const query =
        prisma.foundingCreatorApplication.findFirst.mock.calls[0][0];
      expect(query.where).toEqual({ profileId: 'prof_1' });
      expect(query.orderBy).toEqual({ createdAt: 'desc' });
      expect(query.select.declineReason).toBe(true);
      expect(query.select.decidedById).toBeUndefined();
    });

    it('says a free year given has started', async () => {
      prisma.foundingCreatorApplication.findFirst.mockResolvedValue(
        application({
          platformSubscription: {
            status: 'TRIALING',
            currentPeriodEnd: new Date('2027-11-25T00:00:00.000Z'),
          },
        }),
      );

      expect((await service.status('u_1', 'prof_1')).freeYear).toBe('STARTED');
    });

    it('says an approved year waits for the identity to be verified', async () => {
      prisma.profile.findFirst.mockResolvedValue({
        ...creator,
        user: { identityVerifiedAt: null },
      });
      prisma.foundingCreatorApplication.findFirst.mockResolvedValue(
        application(),
      );

      const res = await service.status('u_1', 'prof_1');

      expect(res.identityVerified).toBe(false);
      expect(res.freeYear).toBe('NEEDS_IDENTITY');
    });

    it('says a Profile that holds a plan keeps it, and when the year can start', async () => {
      prisma.foundingCreatorApplication.findFirst.mockResolvedValue(
        application(),
      );
      prisma.platformSubscription.count.mockResolvedValueOnce(1);

      expect((await service.status('u_1', 'prof_1')).freeYear).toBe('HAS_PLAN');
      expect((await service.status('u_1', 'prof_1')).freeYear).toBe('READY');
      expect(prisma.platformSubscription.count).toHaveBeenCalledWith({
        where: {
          profileId: 'prof_1',
          addOn: false,
          status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID'] },
        },
      });
    });

    it('has no free year without an application', async () => {
      const res = await service.status('u_1', 'prof_1');
      expect(res.application).toBeNull();
      expect(res.freeYear).toBeNull();
    });
  });

  describe('startFreeYear', () => {
    it('starts the year of the approved application of the owner, for the person who owns the Profile', async () => {
      prisma.foundingCreatorApplication.findFirst
        // The approved application of the Profile.
        .mockResolvedValueOnce({ id: 'app_1' })
        // Read again to start it.
        .mockResolvedValueOnce({
          profileId: 'prof_1',
          platformSubscriptionId: null,
          profile: { userId: 'u_1' },
        });

      await service.startFreeYear('u_1', 'prof_1');

      expect(
        prisma.foundingCreatorApplication.findFirst,
      ).toHaveBeenNthCalledWith(1, {
        where: { profileId: 'prof_1', status: 'APPROVED' },
        select: { id: true },
      });
      expect(payments.startFoundingYear).toHaveBeenCalledWith({
        userId: 'u_1',
        profileId: 'prof_1',
        applicationId: 'app_1',
      });
    });

    it('is refused without an approved application, or to whoever does not own the Profile', async () => {
      await expect(
        service.startFreeYear('u_1', 'prof_1'),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.FOUNDING_CREATOR_NOT_FOUND,
      });
      prisma.profile.findFirst.mockResolvedValue(null);
      await expect(
        service.startFreeYear('u_2', 'prof_1'),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.FOUNDING_CREATOR_NOT_FOUND,
      });
      expect(payments.startFoundingYear).not.toHaveBeenCalled();
    });

    it('never gives a year twice: one already given is left as it is', async () => {
      prisma.foundingCreatorApplication.findFirst.mockResolvedValue({
        profileId: 'prof_1',
        platformSubscriptionId: 'row_1',
        profile: { userId: 'u_1' },
      });

      await service.startYearOf('app_1');

      expect(payments.startFoundingYear).not.toHaveBeenCalled();
    });

    it('starts nothing for an application not approved', async () => {
      await expect(service.startYearOf('app_1')).rejects.toMatchObject({
        errorCode: ErrorCode.FOUNDING_CREATOR_NOT_FOUND,
      });
      expect(prisma.foundingCreatorApplication.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app_1', status: 'APPROVED' },
        }),
      );
    });
  });

  it('lists each link once, without the spaces around it', () => {
    expect(distinctLinks([' https://a.es/x ', 'https://a.es/x', ''])).toEqual([
      'https://a.es/x',
    ]);
  });

  // Applications are personal data (PD-034): they go with the Profile, and
  // the Profile with the account, when it is erased.
  it('is erased with the Profile, and the Profile with the account', () => {
    const schema = readFileSync(
      join(import.meta.dirname, '../../prisma/schema.prisma'),
      'utf8',
    );
    // The line of a relation field in a model of the schema.
    const relation = (model: string, field: string) => {
      const block =
        new RegExp(`\\nmodel ${model} \\{([\\s\\S]*?)\\n\\}`).exec(
          schema,
        )?.[1] ?? '';
      return (
        block
          .split('\n')
          .find((line) => new RegExp(`^\\s*${field}\\s`).test(line)) ?? ''
      );
    };

    expect(relation('FoundingCreatorApplication', 'profile')).toContain(
      'onDelete: Cascade',
    );
    expect(relation('Profile', 'user')).toContain('onDelete: Cascade');
    // The free year's subscription is a billing record kept for the fiscal
    // retention: the application lets go of it, never the other way round.
    expect(
      relation('FoundingCreatorApplication', 'platformSubscription'),
    ).toContain('onDelete: SetNull');
  });
});
