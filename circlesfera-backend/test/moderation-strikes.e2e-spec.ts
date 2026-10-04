import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Profile, User } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReviewReportUseCase } from '../src/admin/use-cases/content/commands/review-report.use-case.js';
import { AppModule } from '../src/app.module.js';
import { AppealsService } from '../src/appeals/appeals.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createProfile,
  createUserWithProfile,
} from './factories/profile.factory.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// Proves the strike policy against the real database: a warning first, then
// strikes; the second active strike suspends the Profile, the third bans it;
// records expire on their own; an approved appeal lifts the restriction; a
// sanction never touches the account's other Profiles.
describe('Moderation strikes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reviewReport: ReviewReportUseCase;
  let appeals: AppealsService;
  let adminId: string;
  let reporter: Profile;
  const userIds: string[] = [];
  const suffix = uniqueSuffix();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const newAccount = async () => {
    const created = await createUserWithProfile(prisma);
    userIds.push(created.user.id);
    return created;
  };

  // Files a report about the account and resolves it as an upheld minor
  // violation, which goes through the strike policy.
  const upholdViolation = async (target: User) => {
    const report = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetType: 'USER',
        targetId: target.id,
        reason: 'HARASSMENT',
      },
    });
    await reviewReport.resolveWithPenalty(adminId, report.id, 'STRIKE');
    return report;
  };

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: email, password: 'Password123!' });

  const strikesOf = (profileId: string) =>
    prisma.profileStrike.findMany({
      where: { profileId },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    reviewReport = app.get(ReviewReportUseCase);
    appeals = app.get(AppealsService);

    const admin = await prisma.adminIdentity.create({
      data: {
        email: `strikes_admin_${suffix}@circlesfera.test`,
        passwordHash: 'not-used',
        displayName: 'Strikes e2e moderator',
      },
    });
    adminId = admin.id;
    reporter = (await newAccount()).profile;
  });

  afterAll(async () => {
    await prisma.report.deleteMany({ where: { reporterId: reporter.id } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminIdentity.deleteMany({ where: { id: adminId } });
    await app.close();
  });

  it('escalates warning → strike → suspension, blocks sign-in and lets the Profile appeal', async () => {
    const { user, profile } = await newAccount();

    // First violation: a warning, no consequence.
    await upholdViolation(user);
    let records = await strikesOf(profile.id);
    expect(records.map((r) => [r.kind, r.consequence])).toEqual([
      ['WARNING', 'NONE'],
    ]);
    expect(records[0].reason).toBe('HARASSMENT');
    expect(records[0].adminId).toBe(adminId);
    expect(
      records[0].expiresAt.getTime() - records[0].createdAt.getTime(),
    ).toBe(90 * DAY_MS);
    await login(user.email).expect(200);

    // Second violation: strike 1, still no consequence.
    await upholdViolation(user);
    records = await strikesOf(profile.id);
    expect(records.at(-1)).toMatchObject({
      kind: 'STRIKE',
      consequence: 'NONE',
    });
    await login(user.email).expect(200);

    // Third violation: strike 2 suspends the Profile for 7 days.
    await upholdViolation(user);
    records = await strikesOf(profile.id);
    expect(records.at(-1)).toMatchObject({
      kind: 'STRIKE',
      consequence: 'SUSPENDED',
    });
    const suspended = await prisma.profile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(suspended.isAccountBanned).toBe(false);
    const suspendedFor =
      (suspended.suspendedUntil?.getTime() ?? 0) - Date.now();
    expect(suspendedFor).toBeGreaterThan(6.9 * DAY_MS);
    expect(suspendedFor).toBeLessThanOrEqual(7 * DAY_MS);

    // Every notice reached the Profile with its type.
    const notices = await prisma.notification.findMany({
      where: { recipientId: profile.id, type: 'MODERATION' },
      orderBy: { createdAt: 'asc' },
      select: { targetType: true },
    });
    expect(notices.map((n) => n.targetType)).toEqual([
      'profile_warning',
      'profile_strike',
      'profile_suspension',
    ]);

    // The only Profile is suspended: sign-in is refused with an appeal token.
    const refused = await login(user.email).expect(401);
    expect(refused.body.message).toBe('ACCOUNT_SUSPENDED');
    expect(typeof refused.body.details.appealToken).toBe('string');
    expect(refused.body.details.suspendedUntil).toBeDefined();

    // The appeal filed from the login screen is about that Profile.
    const filed = await request(app.getHttpServer())
      .post('/api/v1/appeals')
      .set('x-appeal-token', refused.body.details.appealToken)
      .send({ targetType: 'ACCOUNT_BAN', reason: 'I did not break the rules' })
      .expect(201);
    expect(filed.body.targetId).toBe(profile.id);

    // Approving it lifts the suspension and withdraws the strike behind it.
    await appeals.update(filed.body.id, { status: 'APPROVED' }, adminId);
    const lifted = await prisma.profile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(lifted.suspendedUntil).toBeNull();
    records = await strikesOf(profile.id);
    expect(records.at(-1)?.revokedAt).not.toBeNull();
    await login(user.email).expect(200);

    // With the suspending strike withdrawn, one strike is active: the next
    // violation is strike 2 again and suspends again.
    await upholdViolation(user);
    records = await strikesOf(profile.id);
    expect(records.at(-1)).toMatchObject({
      kind: 'STRIKE',
      consequence: 'SUSPENDED',
    });
  });

  it('resolving the same report twice records one violation', async () => {
    const { user, profile } = await newAccount();
    const report = await upholdViolation(user);

    await reviewReport.resolveWithPenalty(adminId, report.id, 'STRIKE');

    expect(await strikesOf(profile.id)).toHaveLength(1);
  });

  it('expired records stop counting, each on its own date', async () => {
    const { user, profile } = await newAccount();
    const longAgo = new Date(Date.now() - 100 * DAY_MS);
    // A strike applied 100 days ago has expired; a warning from yesterday is
    // still active.
    await prisma.profileStrike.createMany({
      data: [
        {
          profileId: profile.id,
          kind: 'STRIKE',
          reason: 'SPAM',
          createdAt: longAgo,
          expiresAt: new Date(longAgo.getTime() + 90 * DAY_MS),
        },
        {
          profileId: profile.id,
          kind: 'WARNING',
          reason: 'SPAM',
          createdAt: new Date(Date.now() - DAY_MS),
          expiresAt: new Date(Date.now() + 89 * DAY_MS),
        },
      ],
    });

    await upholdViolation(user);

    // Only the active warning counts: this is strike 1, not strike 2.
    const latest = (await strikesOf(profile.id)).at(-1);
    expect(latest).toMatchObject({ kind: 'STRIKE', consequence: 'NONE' });
    const after = await prisma.profile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(after.suspendedUntil).toBeNull();
  });

  it('the third active strike bans only that Profile; the account signs in with another one', async () => {
    const { user, profile } = await newAccount();
    // A second Profile of the same account, created later.
    const other = await createProfile(prisma, user.id, {
      username: `strikes_other_${suffix}`,
    });
    const recent = new Date(Date.now() - DAY_MS);
    await prisma.profileStrike.createMany({
      data: ['STRIKE', 'STRIKE'].map(() => ({
        profileId: profile.id,
        kind: 'STRIKE' as const,
        reason: 'HARASSMENT' as const,
        createdAt: recent,
        expiresAt: new Date(recent.getTime() + 90 * DAY_MS),
      })),
    });

    await upholdViolation(user);

    const banned = await prisma.profile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(banned.isAccountBanned).toBe(true);
    const untouched = await prisma.profile.findUniqueOrThrow({
      where: { id: other.id },
    });
    expect(untouched.isAccountBanned).toBe(false);
    expect(untouched.suspendedUntil).toBeNull();
    const account = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(account.isActive).toBe(true);
    expect(account.isRootBanned).toBe(false);

    await login(user.email).expect(200);
  });

  it('approving a strike appeal never lifts a later direct ban', async () => {
    const { user, profile } = await newAccount();
    const recent = new Date(Date.now() - DAY_MS);
    await prisma.profileStrike.create({
      data: {
        profileId: profile.id,
        kind: 'STRIKE',
        reason: 'SPAM',
        createdAt: recent,
        expiresAt: new Date(recent.getTime() + 90 * DAY_MS),
      },
    });
    // Strike 2 suspends the Profile; then staff ban it directly for a
    // severe case.
    await upholdViolation(user);
    const suspending = (await strikesOf(profile.id)).at(-1);
    expect(suspending?.consequence).toBe('SUSPENDED');
    const severe = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetType: 'USER',
        targetId: user.id,
        reason: 'ILLEGAL_CONTENT',
      },
    });
    await reviewReport.resolveWithPenalty(adminId, severe.id, 'BAN');

    const appeal = await appeals.create(user.id, {
      targetType: 'STRIKE',
      targetId: suspending?.id,
      reason: 'The spam report was a mistake',
    });
    await appeals.update(appeal.id, { status: 'APPROVED' }, adminId);

    const after = await prisma.profile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    // The suspension the strike caused is lifted; the direct ban stays.
    expect(after.suspendedUntil).toBeNull();
    expect(after.isAccountBanned).toBe(true);
    expect(
      (await strikesOf(profile.id)).find((r) => r.id === suspending?.id)
        ?.revokedAt,
    ).not.toBeNull();
  });

  it('a Profile cannot appeal a strike of another account', async () => {
    const victim = await newAccount();
    const stranger = await newAccount();
    await upholdViolation(victim.user);
    const [warning] = await strikesOf(victim.profile.id);

    await expect(
      appeals.create(stranger.user.id, {
        targetType: 'STRIKE',
        targetId: warning.id,
        reason: 'Trying to clear someone else',
      }),
    ).rejects.toThrow('Strike not found');
  });
});
