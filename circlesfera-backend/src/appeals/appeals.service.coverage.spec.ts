import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppealsService } from './appeals.service.js';

// Every appeal type, the staff listing previews and the outcome notices.
// The base spec covers ownership refusals, the pending lock and the strike
// and restriction approvals.

function makePrisma() {
  const prisma = {
    appeal: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'appeal-1',
        ...data,
      })),
      count: vi.fn().mockResolvedValue(0),
    },
    post: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    profile: { findFirst: vi.fn(), findMany: vi.fn() },
    profileStrike: { findFirst: vi.fn(), findUnique: vi.fn() },
    riskCase: { findFirst: vi.fn(), findUnique: vi.fn() },
    user: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) },
    adminIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
    adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
  );
  return prisma;
}

function build() {
  const prisma = makePrisma();
  const notifications = { create: vi.fn().mockResolvedValue(undefined) };
  const email = {
    sendAppealDecisionEmail: vi.fn().mockResolvedValue(undefined),
  };
  const events = { emit: vi.fn() };
  const strikes = {
    revokeForAppeal: vi.fn().mockResolvedValue(null),
    liftRestrictionForAppeal: vi.fn(),
    invalidateProfileCache: vi.fn(),
  };
  const risk = { liftRestrictionForAppeal: vi.fn().mockResolvedValue(null) };
  const limits = { clearRestricted: vi.fn() };
  const service = new AppealsService(
    prisma as never,
    notifications as never,
    email as never,
    events as never,
    strikes as never,
    risk as never,
    limits as never,
  );
  return { service, prisma, notifications, email, events, strikes, limits };
}

const reason = 'Please review this decision';

describe('AppealsService.create — every appeal type', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
    t.prisma.appeal.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'appeal-1',
        ...data,
      }),
    );
  });

  it.each(['POST_REMOVAL', 'STRIKE', 'RESTRICTION'])(
    '%s requires the appealed item',
    async (targetType) => {
      await expect(
        t.service.create('user-1', { targetType, reason } as never),
      ).rejects.toThrow(BadRequestException);
      await expect(
        t.service.create('user-1', {
          targetType,
          targetId: '   ',
          reason,
        } as never),
      ).rejects.toThrow(BadRequestException);
      expect(t.prisma.appeal.create).not.toHaveBeenCalled();
    },
  );

  it('files an appeal about an own post', async () => {
    t.prisma.post.findFirst.mockResolvedValue({ id: 'post-1' });

    const appeal = await t.service.create('user-1', {
      targetType: 'POST_REMOVAL',
      targetId: ' post-1 ',
      reason,
    } as never);

    expect(appeal).toMatchObject({ targetId: 'post-1' });
  });

  it('files an appeal about an own strike', async () => {
    t.prisma.profileStrike.findFirst.mockResolvedValue({ id: 'strike-1' });

    const appeal = await t.service.create('user-1', {
      targetType: 'STRIKE',
      targetId: 'strike-1',
      reason,
    } as never);

    expect(appeal).toMatchObject({
      targetType: 'STRIKE',
      targetId: 'strike-1',
    });
    expect(t.prisma.profileStrike.findFirst).toHaveBeenCalledWith({
      where: { id: 'strike-1', profile: { userId: 'user-1' } },
      select: { id: true },
    });
  });

  it('files an appeal about an own restriction', async () => {
    t.prisma.riskCase.findFirst.mockResolvedValue({ id: 'case-1' });

    const appeal = await t.service.create('user-1', {
      targetType: 'RESTRICTION',
      targetId: 'case-1',
      reason,
    } as never);

    expect(appeal).toMatchObject({ targetId: 'case-1' });
  });

  it('refuses a ban appeal naming a Profile of another account', async () => {
    t.prisma.profile.findFirst.mockResolvedValue(null);

    await expect(
      t.service.create('user-1', {
        targetType: 'ACCOUNT_BAN',
        targetId: 'other-profile',
        reason,
      } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('accepts a ban appeal with no Profile and reports it without a target', async () => {
    await t.service.create('user-1', {
      targetType: 'ACCOUNT_BAN',
      reason,
    } as never);

    expect(t.prisma.appeal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ targetId: null, status: 'PENDING' }),
      }),
    );
    expect(t.events.emit).toHaveBeenCalledWith(
      'moderation.report_filed',
      expect.objectContaining({ targetId: 'N/A' }),
    );
  });

  it('ignores a target on appeals that take none', async () => {
    const appeal = await t.service.create('user-1', {
      targetType: 'BOT_LABEL',
      targetId: 'anything',
      reason,
    } as never);

    expect(appeal).toMatchObject({ targetId: undefined });
  });
});

describe('AppealsService.findAll — staff listing', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  const appeal = (overrides: Record<string, unknown>) => ({
    id: 'appeal-1',
    userId: 'user-1',
    targetId: null,
    user: {
      id: 'user-1',
      email: 'a@example.com',
      isActive: true,
      profiles: [
        {
          username: 'ana',
          fullName: 'Ana',
          avatar: null,
          suspendedUntil: null,
        },
      ],
    },
    ...overrides,
  });

  it('pages the results and filters only by a known status', async () => {
    t.prisma.appeal.count.mockResolvedValue(45);

    const page = await t.service.findAll(3, 20, 'APPROVED');
    await t.service.findAll(1, 20, 'DROP TABLE');

    expect(t.prisma.appeal.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { status: 'APPROVED' },
        skip: 40,
        take: 20,
      }),
    );
    expect(t.prisma.appeal.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: {} }),
    );
    expect(page.meta).toEqual({ total: 45, page: 3, limit: 20, totalPages: 3 });
  });

  it('reports at least one page when there are no appeals', async () => {
    const page = await t.service.findAll();
    expect(page).toEqual({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('previews a removed post, truncating its caption', async () => {
    t.prisma.appeal.findMany.mockResolvedValue([
      appeal({ targetType: 'POST_REMOVAL', targetId: 'post-1' }),
      appeal({ targetType: 'POST_REMOVAL', targetId: 'gone' }),
    ]);
    t.prisma.post.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === 'post-1'
          ? {
              caption: 'x'.repeat(300),
              moderationStatus: 'HIDDEN',
              type: 'IMAGE',
            }
          : null,
    );

    const { data } = await t.service.findAll();

    expect(data[0].targetPreview).toEqual({
      text: 'x'.repeat(160),
      moderationStatus: 'HIDDEN',
      type: 'IMAGE',
    });
    expect(data[1].targetPreview).toBeNull();
    expect(data[0].user).toMatchObject({
      email: 'a@example.com',
      profile: { username: 'ana' },
    });
  });

  it('previews a post without caption', async () => {
    t.prisma.appeal.findMany.mockResolvedValue([
      appeal({ targetType: 'POST_REMOVAL', targetId: 'post-1' }),
    ]);
    t.prisma.post.findUnique.mockResolvedValue({
      caption: null,
      moderationStatus: 'HIDDEN',
      type: 'VIDEO',
    });

    const { data } = await t.service.findAll();
    expect(data[0].targetPreview?.text).toBeNull();
  });

  it('previews the account state of a ban appeal', async () => {
    const suspended = appeal({ targetType: 'ACCOUNT_BAN' });
    (
      suspended.user.profiles[0] as { suspendedUntil: Date | null }
    ).suspendedUntil = new Date();
    t.prisma.appeal.findMany.mockResolvedValue([
      suspended,
      appeal({
        targetType: 'ACCOUNT_BAN',
        user: { id: 'u', email: 'e', isActive: false, profiles: [] },
      }),
      appeal({ targetType: 'ACCOUNT_BAN' }),
    ]);

    const { data } = await t.service.findAll();

    expect(data.map((d) => d.targetPreview)).toEqual([
      { text: 'Account', moderationStatus: 'SUSPENDED', type: 'ACCOUNT' },
      { text: 'Account inactive', moderationStatus: 'BANNED', type: 'ACCOUNT' },
      { text: 'Account', moderationStatus: 'ACTIVE', type: 'ACCOUNT' },
    ]);
  });

  it('previews whether the appealed strike is active, withdrawn or expired', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    const strikes: Record<string, unknown> = {
      active: {
        kind: 'STRIKE',
        reason: 'SPAM',
        consequence: 'SUSPENDED',
        revokedAt: null,
        expiresAt: future,
      },
      revoked: {
        kind: 'WARNING',
        reason: 'SPAM',
        consequence: 'NONE',
        revokedAt: past,
        expiresAt: future,
      },
      expired: {
        kind: 'STRIKE',
        reason: 'HARASSMENT',
        consequence: 'NONE',
        revokedAt: null,
        expiresAt: past,
      },
    };
    t.prisma.appeal.findMany.mockResolvedValue(
      ['active', 'revoked', 'expired', 'missing'].map((id) =>
        appeal({ targetType: 'STRIKE', targetId: id }),
      ),
    );
    t.prisma.profileStrike.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => strikes[where.id] ?? null,
    );

    const { data } = await t.service.findAll();

    expect(data.map((d) => d.targetPreview)).toEqual([
      {
        text: 'STRIKE for SPAM (SUSPENDED)',
        moderationStatus: 'ACTIVE',
        type: 'STRIKE',
      },
      { text: 'WARNING for SPAM', moderationStatus: 'REVOKED', type: 'STRIKE' },
      {
        text: 'STRIKE for HARASSMENT',
        moderationStatus: 'EXPIRED',
        type: 'STRIKE',
      },
      null,
    ]);
  });

  it('previews whether a spam restriction is still in force', async () => {
    const future = new Date(Date.now() + 3_600_000);
    const cases: Record<string, unknown> = {
      live: { score: 80, restrictedUntil: future, status: 'OPEN' },
      over: { score: 75, restrictedUntil: null, status: 'RESOLVED' },
    };
    t.prisma.appeal.findMany.mockResolvedValue(
      ['live', 'over', 'missing'].map((id) =>
        appeal({ targetType: 'RESTRICTION', targetId: id }),
      ),
    );
    t.prisma.riskCase.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => cases[where.id] ?? null,
    );

    const { data } = await t.service.findAll();

    expect(data.map((d) => d.targetPreview)).toEqual([
      {
        text: 'Spam review case, score 80',
        moderationStatus: 'RESTRICTED',
        type: 'RESTRICTION',
      },
      {
        text: 'Spam review case, score 75',
        moderationStatus: 'RESOLVED',
        type: 'RESTRICTION',
      },
      null,
    ]);
  });

  it('previews a bot label and tolerates an appeal without user', async () => {
    t.prisma.appeal.findMany.mockResolvedValue([
      appeal({ targetType: 'BOT_LABEL', user: null }),
    ]);

    const { data } = await t.service.findAll();

    expect(data[0]).toMatchObject({
      user: null,
      targetPreview: {
        text: 'Possible bot label',
        moderationStatus: 'LABELED',
        type: 'ACCOUNT',
      },
    });
  });
});

describe('AppealsService.update — effects and notices', () => {
  let t: ReturnType<typeof build>;
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    t = build();
    errorSpy.mockClear();
  });

  const stored = (overrides: Record<string, unknown>) => ({
    id: 'appeal-1',
    userId: 'user-1',
    status: 'PENDING',
    resolvedAt: null,
    targetId: null,
    user: { profiles: [] },
    ...overrides,
  });

  it('a ban appeal without Profile lifts every restricted Profile of the account', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'ACCOUNT_BAN' }),
    );
    t.prisma.profile.findMany.mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }]);

    await t.service.update(
      'appeal-1',
      { status: 'APPROVED' } as never,
      'admin-1',
    );

    expect(t.prisma.profile.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [{ isAccountBanned: true }, { suspendedUntil: { not: null } }],
      },
      select: { id: true },
    });
    expect(t.strikes.liftRestrictionForAppeal).toHaveBeenCalledTimes(2);
    expect(t.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { isActive: true },
    });
    expect(t.strikes.invalidateProfileCache).toHaveBeenCalledWith([
      'p-1',
      'p-2',
    ]);
  });

  it('an approved bot-label appeal clears the label', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'BOT_LABEL' }),
    );

    await t.service.update(
      'appeal-1',
      { status: 'APPROVED' } as never,
      'admin-1',
    );

    expect(t.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { botLabeledAt: null, botLabelReason: null },
    });
  });

  it('an approved post appeal makes the post visible and links it in the notice', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'POST_REMOVAL', targetId: 'post-1' }),
    );
    t.prisma.profile.findFirst.mockResolvedValue({ id: 'p-first' });

    await t.service.update(
      'appeal-1',
      { status: 'APPROVED' } as never,
      'admin-1',
    );

    expect(t.prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { moderationStatus: 'VISIBLE' },
    });
    expect(t.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'p-first', postId: 'post-1' }),
    );
  });

  it('a restriction that was already lifted does not clear any caps', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'RESTRICTION', targetId: 'case-1' }),
    );
    t.prisma.riskCase.findUnique.mockResolvedValue(null);
    t.prisma.profile.findFirst.mockResolvedValue({ id: 'p-first' });

    await t.service.update(
      'appeal-1',
      { status: 'APPROVED' } as never,
      'admin-1',
    );

    expect(t.limits.clearRestricted).not.toHaveBeenCalled();
    expect(t.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'p-first' }),
    );
  });

  it('a strike that no longer exists is not added to the cache invalidation', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'STRIKE', targetId: 'strike-1' }),
    );
    t.prisma.profileStrike.findUnique.mockResolvedValue(null);
    t.prisma.profile.findFirst.mockResolvedValue(null);

    await t.service.update(
      'appeal-1',
      { status: 'APPROVED' } as never,
      'admin-1',
    );

    expect(t.strikes.invalidateProfileCache).toHaveBeenCalledWith([]);
    expect(t.notifications.create).not.toHaveBeenCalled();
  });

  it('records the decision in the audit log by outcome', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'BOT_LABEL' }),
    );

    await t.service.update(
      'appeal-1',
      { status: 'APPROVED', adminNotes: 'Real person' } as never,
      'admin-1',
    );
    await t.service.update(
      'appeal-1',
      { status: 'REJECTED' } as never,
      'admin-1',
    );

    expect(t.prisma.adminAuditLog.create).toHaveBeenNthCalledWith(1, {
      data: {
        adminId: 'admin-1',
        action: 'ACCOUNT_RESTORED',
        targetType: 'appeal',
        targetId: 'appeal-1',
        details: 'Appeal APPROVED: Real person',
      },
    });
    expect(t.prisma.adminAuditLog.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REPORT_REVIEWED',
          details: 'Appeal REJECTED:',
        }),
      }),
    );
  });

  it('notifies the Profile the decision was about, with the staff notes', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'ACCOUNT_BAN', targetId: 'p-banned' }),
    );

    await t.service.update(
      'appeal-1',
      { status: 'REJECTED', adminNotes: 'Repeated spam' } as never,
      'admin-1',
    );

    expect(t.notifications.create).toHaveBeenCalledWith({
      recipientId: 'p-banned',
      senderId: undefined,
      type: 'MODERATION',
      content: 'Your appeal was rejected. Notes: Repeated spam',
      postId: undefined,
    });
  });

  it('describes any other status in lower case', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'BOT_LABEL', status: 'APPROVED' }),
    );
    t.prisma.profile.findFirst.mockResolvedValue({ id: 'p-first' });

    await t.service.update(
      'appeal-1',
      { status: 'PENDING' } as never,
      'admin-1',
    );

    expect(t.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Your appeal was pending.' }),
    );
  });

  it('emails the outcome to the account, with defaults for name and notes', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'BOT_LABEL' }),
    );
    t.prisma.user.findUnique.mockResolvedValue({
      email: 'a@example.com',
      profiles: [],
    });

    await t.service.update(
      'appeal-1',
      { status: 'REJECTED' } as never,
      'admin-1',
    );

    expect(t.email.sendAppealDecisionEmail).toHaveBeenCalledWith(
      'a@example.com',
      undefined,
      false,
      undefined,
    );
  });

  it('emails an approval using the Profile name', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'BOT_LABEL' }),
    );
    t.prisma.user.findUnique.mockResolvedValue({
      email: 'a@example.com',
      profiles: [{ username: 'ana', fullName: null }],
    });

    await t.service.update(
      'appeal-1',
      { status: 'APPROVED', adminNotes: 'Restored' } as never,
      'admin-1',
    );

    expect(t.email.sendAppealDecisionEmail).toHaveBeenCalledWith(
      'a@example.com',
      'ana',
      true,
      'Restored',
    );
  });

  it('a failing audit log, notice or email never undoes the decision', async () => {
    t.prisma.appeal.findUnique.mockResolvedValue(
      stored({ targetType: 'ACCOUNT_BAN', targetId: 'p-1' }),
    );
    t.prisma.adminAuditLog.create.mockRejectedValue(new Error('audit down'));
    t.notifications.create.mockRejectedValue(new Error('notices down'));
    t.prisma.user.findUnique.mockResolvedValue({
      email: 'a@example.com',
      profiles: [{ username: 'ana', fullName: 'Ana' }],
    });
    t.email.sendAppealDecisionEmail.mockRejectedValue(new Error('mail down'));

    const result = await t.service.update(
      'appeal-1',
      { status: 'APPROVED' } as never,
      'admin-1',
    );

    expect(result).toMatchObject({ status: 'APPROVED' });
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(3));
  });
});
