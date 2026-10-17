import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEAM_SEATS, TeamService } from './team.service.js';

describe('TeamService', () => {
  const prisma = {
    profile: { findUnique: vi.fn(), findFirst: vi.fn() },
    profileMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    signIn: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  const access = { assertCan: vi.fn() };
  const events = { emit: vi.fn() };
  let team: TeamService;

  const business = { accountType: 'BUSINESS', verificationLevel: 'BUSINESS' };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    access.assertCan.mockResolvedValue(undefined);
    team = new TeamService(prisma as never, access as never, events as never);
  });

  const notices = () =>
    events.emit.mock.calls
      .filter(([name]) => name === 'notification.create')
      .map(([, payload]) => payload);

  describe('the team of the Profile in use', () => {
    it('is for the owner only, and lists the members holding a seat with the first Profile of each', async () => {
      prisma.profile.findUnique.mockResolvedValue(business);
      prisma.profileMember.findMany.mockResolvedValue([
        {
          id: 'm-1',
          role: 'EDITOR',
          status: 'ACTIVE',
          createdAt: new Date(),
          acceptedAt: new Date(),
          user: { profiles: [{ id: 'p-ana', username: 'ana' }] },
        },
      ]);

      const res = await team.team('u-owner', 'p-shop');

      expect(access.assertCan).toHaveBeenCalledWith(
        'u-owner',
        'p-shop',
        'team.manage',
      );
      expect(res.available).toBe(true);
      expect(res.seats).toEqual({ used: 1, max: TEAM_SEATS });
      expect(res.members[0]).toMatchObject({
        id: 'm-1',
        person: { username: 'ana' },
      });
      expect(prisma.profileMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            profileId: 'p-shop',
            status: { in: ['INVITED', 'ACTIVE', 'PAUSED'] },
          },
        }),
      );
    });

    it('says a team is not available without the Business plan', async () => {
      prisma.profile.findUnique.mockResolvedValue({
        accountType: 'BUSINESS',
        verificationLevel: 'BASIC',
      });
      prisma.profileMember.findMany.mockResolvedValue([]);
      expect((await team.team('u-owner', 'p-shop')).available).toBe(false);
    });

    it('refuses someone who cannot manage the team', async () => {
      access.assertCan.mockRejectedValue(new ForbiddenException());
      await expect(team.team('u-editor', 'p-shop')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('inviting', () => {
    const invite = (role: 'ADMINISTRATOR' | 'EDITOR' = 'EDITOR') =>
      team.invite('u-owner', 'p-shop', { username: 'Ana', role });

    beforeEach(() => {
      prisma.profile.findFirst.mockImplementation(
        async (args: { where: { userId?: string } }) =>
          args.where.userId ? { id: 'p-ana' } : { userId: 'u-ana' },
      );
      prisma.profile.findUnique.mockResolvedValue(business);
      prisma.profileMember.findUnique.mockResolvedValue(null);
      prisma.profileMember.count.mockResolvedValue(0);
      prisma.profileMember.create.mockResolvedValue({ id: 'm-new' });
    });

    it('invites a person by username, under a lock on the Profile, and tells them', async () => {
      const res = await invite('ADMINISTRATOR');

      expect(res).toEqual({ id: 'm-new' });
      expect(prisma.profile.findFirst).toHaveBeenCalledWith({
        where: { username: { equals: 'Ana', mode: 'insensitive' } },
        select: { userId: true },
      });
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.profileMember.create).toHaveBeenCalledWith({
        data: {
          profileId: 'p-shop',
          userId: 'u-ana',
          role: 'ADMINISTRATOR',
          status: 'INVITED',
          invitedById: 'u-owner',
          acceptedAt: null,
          removedAt: null,
        },
      });
      expect(notices()).toEqual([
        {
          recipientId: 'p-ana',
          senderId: 'p-shop',
          type: 'SYSTEM',
          notice: { key: 'team_invited', role: 'ADMINISTRATOR' },
          targetType: 'team',
          targetId: 'p-shop',
        },
      ]);
    });

    it('needs the Business plan', async () => {
      prisma.profile.findUnique.mockResolvedValue({
        accountType: 'BUSINESS',
        verificationLevel: 'ELITE',
      });
      await expect(invite()).rejects.toMatchObject({
        errorCode: 'PLAN_REQUIRED',
      });
      expect(prisma.profileMember.create).not.toHaveBeenCalled();
    });

    it('refuses an unknown username, and the owner themselves', async () => {
      prisma.profile.findFirst.mockResolvedValueOnce(null);
      await expect(invite()).rejects.toMatchObject({
        errorCode: 'PROFILE_NOT_FOUND',
      });
      prisma.profile.findFirst.mockResolvedValueOnce({ userId: 'u-owner' });
      await expect(invite()).rejects.toMatchObject({
        errorCode: 'TEAM_INVITE_SELF',
      });
    });

    it('refuses a person already invited, in the team or paused', async () => {
      for (const status of ['INVITED', 'ACTIVE', 'PAUSED']) {
        prisma.profileMember.findUnique.mockResolvedValueOnce({
          id: 'm-old',
          status,
        });
        await expect(invite()).rejects.toMatchObject({
          errorCode: 'TEAM_ALREADY_MEMBER',
        });
      }
    });

    it(`keeps the team at ${TEAM_SEATS} besides the owner`, async () => {
      prisma.profileMember.count.mockResolvedValue(TEAM_SEATS);
      await expect(invite()).rejects.toMatchObject({ errorCode: 'TEAM_FULL' });
      expect(prisma.profileMember.count).toHaveBeenCalledWith({
        where: {
          profileId: 'p-shop',
          status: { in: ['INVITED', 'ACTIVE', 'PAUSED'] },
        },
      });
    });

    it('invites again a person who declined or was removed, on the same row', async () => {
      prisma.profileMember.findUnique.mockResolvedValue({
        id: 'm-old',
        status: 'REMOVED',
      });
      prisma.profileMember.update.mockResolvedValue({ id: 'm-old' });

      await invite();

      expect(prisma.profileMember.update).toHaveBeenCalledWith({
        where: { id: 'm-old' },
        data: expect.objectContaining({
          status: 'INVITED',
          role: 'EDITOR',
          removedAt: null,
        }),
      });
      expect(prisma.profileMember.create).not.toHaveBeenCalled();
    });

    it('sends no notice when the person has no Profile left', async () => {
      prisma.profile.findFirst.mockImplementation(
        async (args: { where: { userId?: string } }) =>
          args.where.userId ? null : { userId: 'u-ana' },
      );
      await invite();
      expect(notices()).toEqual([]);
    });
  });

  describe('removing', () => {
    it('ends a member or an invitation of this Profile at once', async () => {
      prisma.profileMember.updateMany.mockResolvedValue({ count: 1 });

      await team.remove('u-owner', 'p-shop', 'm-1');

      expect(access.assertCan).toHaveBeenCalledWith(
        'u-owner',
        'p-shop',
        'team.manage',
      );
      expect(prisma.profileMember.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'm-1',
          profileId: 'p-shop',
          status: { in: ['INVITED', 'ACTIVE', 'PAUSED'] },
        },
        data: { status: 'REMOVED', removedAt: expect.any(Date) },
      });
    });

    it('says so when there is no such member', async () => {
      prisma.profileMember.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        team.remove('u-owner', 'p-shop', 'm-x'),
      ).rejects.toMatchObject({ errorCode: 'TEAM_MEMBER_NOT_FOUND' });
    });
  });

  describe('the invited person', () => {
    it('sees the invitations waiting for them', async () => {
      prisma.profileMember.findMany.mockResolvedValue([{ id: 'm-1' }]);
      expect(await team.invitations('u-ana')).toEqual([{ id: 'm-1' }]);
      expect(prisma.profileMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u-ana', status: 'INVITED' },
        }),
      );
    });

    it('accepts only with two-step verification on the sign-in in use', async () => {
      prisma.profileMember.findFirst.mockResolvedValue({
        id: 'm-1',
        profileId: 'p-shop',
        role: 'EDITOR',
      });
      prisma.signIn.findFirst.mockResolvedValue({ isTwoFactorEnabled: false });

      await expect(
        team.accept('u-ana', 'm-1', 'sign-in-ana'),
      ).rejects.toMatchObject({ errorCode: 'TEAM_TWO_FACTOR_REQUIRED' });
      expect(prisma.signIn.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sign-in-ana', userId: 'u-ana' },
        }),
      );
      expect(prisma.profileMember.updateMany).not.toHaveBeenCalled();
    });

    it('accepting makes the member active and tells the Profile', async () => {
      prisma.profileMember.findFirst.mockResolvedValue({
        id: 'm-1',
        profileId: 'p-shop',
        role: 'EDITOR',
      });
      prisma.signIn.findFirst.mockResolvedValue({ isTwoFactorEnabled: true });
      prisma.profileMember.updateMany.mockResolvedValue({ count: 1 });
      prisma.profile.findFirst.mockResolvedValue({ id: 'p-ana' });

      await team.accept('u-ana', 'm-1');

      expect(prisma.signIn.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-ana' } }),
      );
      expect(prisma.profileMember.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1', status: 'INVITED' },
        data: { status: 'ACTIVE', acceptedAt: expect.any(Date) },
      });
      expect(notices()).toEqual([
        {
          recipientId: 'p-shop',
          senderId: 'p-ana',
          type: 'SYSTEM',
          notice: { key: 'team_accepted', role: 'EDITOR' },
          targetType: 'team',
          targetId: 'p-shop',
        },
      ]);
    });

    it('an invitation answered meanwhile is not accepted twice', async () => {
      prisma.profileMember.findFirst.mockResolvedValue({
        id: 'm-1',
        profileId: 'p-shop',
        role: 'EDITOR',
      });
      prisma.signIn.findFirst.mockResolvedValue({ isTwoFactorEnabled: true });
      prisma.profileMember.updateMany.mockResolvedValue({ count: 0 });

      await expect(team.accept('u-ana', 'm-1')).rejects.toMatchObject({
        errorCode: 'TEAM_MEMBER_NOT_FOUND',
      });
      expect(notices()).toEqual([]);
    });

    it('declines, and cannot answer an invitation that is not theirs', async () => {
      prisma.profileMember.findFirst.mockResolvedValueOnce({
        id: 'm-1',
        profileId: 'p-shop',
        role: 'EDITOR',
      });
      await team.decline('u-ana', 'm-1');
      expect(prisma.profileMember.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1', status: 'INVITED' },
        data: { status: 'DECLINED' },
      });

      prisma.profileMember.findFirst.mockResolvedValueOnce(null);
      await expect(team.decline('u-other', 'm-1')).rejects.toMatchObject({
        errorCode: 'TEAM_MEMBER_NOT_FOUND',
      });
      expect(prisma.profileMember.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: 'm-1', userId: 'u-other', status: 'INVITED' },
        }),
      );
    });
  });
});
