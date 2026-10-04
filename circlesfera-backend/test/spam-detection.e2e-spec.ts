import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdminRiskCasesService } from '../src/admin/admin-risk-cases.service.js';
import { AppModule } from '../src/app.module.js';
import { AppealsService } from '../src/appeals/appeals.service.js';
import { CreateGroupUseCase } from '../src/chat/use-cases/groups/create-group.use-case.js';
import { FollowsService } from '../src/follows/follows.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  ActionLimitsService,
  trustKeys,
} from '../src/trust/action-limits.service.js';
import { RiskDetectorService } from '../src/trust/risk-detector.service.js';
import { ACTION_WINDOWS } from '../src/trust/trust.constants.js';
import { TRUST_REDIS } from '../src/trust/trust-redis.provider.js';
import { createUserWithProfile } from './factories/profile.factory.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

// Proves spam protection against the real database and Redis: per-Profile
// caps on follows and message requests, the detector opening a review case
// and restricting a high-risk Profile, staff review, and the appeal.
describe('Spam and bot protection (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let follows: FollowsService;
  let createConversation: CreateGroupUseCase;
  let limits: ActionLimitsService;
  let detector: RiskDetectorService;
  let riskCases: AdminRiskCasesService;
  let appeals: AppealsService;
  let adminId: string;
  const userIds: string[] = [];
  const suffix = uniqueSuffix();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const newAccount = async (user: { isTestAccount?: boolean } = {}) => {
    const created = await createUserWithProfile(prisma, { user });
    userIds.push(created.user.id);
    return created;
  };

  // Puts a Profile's counter for the current window at a given value.
  const setCounter = async (
    action: 'follow' | 'message_request',
    windowName: string,
    profileId: string,
    value: number,
  ) => {
    const w = ACTION_WINDOWS[action].find((x) => x.name === windowName);
    if (!w) throw new Error('unknown window');
    const bucket = Math.floor(Date.now() / 1000 / w.seconds);
    await redis.set(
      trustKeys.counter(action, w, profileId, bucket),
      String(value),
      'EX',
      w.seconds,
    );
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(TRUST_REDIS);
    follows = app.get(FollowsService);
    createConversation = app.get(CreateGroupUseCase);
    limits = app.get(ActionLimitsService);
    detector = app.get(RiskDetectorService);
    riskCases = app.get(AdminRiskCasesService);
    appeals = app.get(AppealsService);

    const admin = await prisma.adminIdentity.create({
      data: {
        email: `spam_admin_${suffix}@circlesfera.test`,
        passwordHash: 'not-used',
        displayName: 'Spam e2e moderator',
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminIdentity.deleteMany({ where: { id: adminId } });
    await app.close();
  });

  it('refuses a follow over the hourly cap and writes nothing', async () => {
    const actor = await newAccount();
    const target = await newAccount();
    await setCounter('follow', '1h', actor.profile.id, 120);

    const error = await follows
      .toggle(target.profile.username, actor.profile.id, actor.user.id)
      .catch((e) => e);

    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({
      errorCode: 'ACTION_LIMIT_REACHED',
      details: { action: 'follow' },
    });
    expect(
      await prisma.follow.count({ where: { followerId: actor.profile.id } }),
    ).toBe(0);
  });

  it('a follow under the cap goes through and is counted', async () => {
    const actor = await newAccount();
    const target = await newAccount();

    await follows.toggle(
      target.profile.username,
      actor.profile.id,
      actor.user.id,
    );

    expect(
      await prisma.follow.count({ where: { followerId: actor.profile.id } }),
    ).toBe(1);
    expect((await limits.readSignals(actor.profile.id)).writesToday).toBe(1);
  });

  it('refuses a message request over the daily cap', async () => {
    const actor = await newAccount();
    const stranger = await newAccount();
    await setCounter('message_request', '1d', actor.profile.id, 60);

    await expect(
      createConversation.execute(actor.profile.id, [stranger.profile.id]),
    ).rejects.toMatchObject({ errorCode: 'ACTION_LIMIT_REACHED' });
    expect(
      await prisma.participant.count({
        where: { profileId: stranger.profile.id },
      }),
    ).toBe(0);
  });

  it('opens a case, restricts a high-risk Profile, and staff dismissal lifts it', async () => {
    const actor = await newAccount();
    const pid = actor.profile.id;
    // Fast following, the same text five times and the same text as two
    // other Profiles: 25 + 20 + 25 = 70.
    await setCounter('follow', '10m', pid, 60);
    await redis.set(trustKeys.repeatedSignal(pid), '6', 'EX', 3600);
    await redis.set(trustKeys.coordinatedSignal(pid), '3', 'EX', 3600);

    const evaluation = await detector.evaluateAndRecord(pid);

    expect(evaluation?.score).toBe(70);
    const riskCase = await prisma.riskCase.findFirstOrThrow({
      where: { profileId: pid, status: 'OPEN' },
    });
    expect(riskCase.score).toBe(70);
    expect(riskCase.signals).toEqual([
      { key: 'velocity', points: 25, value: 60 },
      { key: 'repeatedText', points: 20, value: 6 },
      { key: 'coordinatedText', points: 25, value: 3 },
    ]);
    const restrictedFor =
      (riskCase.restrictedUntil?.getTime() ?? 0) - Date.now();
    expect(restrictedFor).toBeGreaterThan(71 * 60 * 60 * 1000);
    expect(restrictedFor).toBeLessThanOrEqual(72 * 60 * 60 * 1000);

    // The participant was told, with the case to appeal.
    const notice = await prisma.notification.findFirstOrThrow({
      where: { recipientId: pid, targetType: 'profile_restriction' },
    });
    expect(notice.targetId).toBe(riskCase.id);

    // Reduced caps: 5 message requests a day.
    for (let i = 0; i < 5; i++) await limits.consume(pid, 'message_request');
    await expect(limits.consume(pid, 'message_request')).rejects.toMatchObject({
      errorCode: 'ACTION_LIMIT_REACHED',
    });

    // A second evaluation keeps one open case.
    await detector.evaluateAndRecord(pid);
    expect(
      await prisma.riskCase.count({
        where: { profileId: pid, status: 'OPEN' },
      }),
    ).toBe(1);

    // Staff dismiss it: the caps are back to normal.
    await riskCases.resolve(adminId, riskCase.id, 'DISMISSED');
    const resolved = await prisma.riskCase.findUniqueOrThrow({
      where: { id: riskCase.id },
    });
    expect(resolved).toMatchObject({
      status: 'DISMISSED',
      decision: 'DISMISSED',
      reviewedById: adminId,
      restrictedUntil: null,
    });
    await expect(
      limits.consume(pid, 'message_request'),
    ).resolves.toBeUndefined();
  });

  it('an approved appeal lifts a staff restriction', async () => {
    const actor = await newAccount();
    const pid = actor.profile.id;
    const riskCase = await prisma.riskCase.create({
      data: { profileId: pid, score: 60, signals: [] },
    });
    await riskCases.resolve(adminId, riskCase.id, 'RESTRICTED');
    const restricted = await prisma.riskCase.findUniqueOrThrow({
      where: { id: riskCase.id },
    });
    expect(restricted.status).toBe('ACTIONED');
    expect(
      (restricted.restrictedUntil?.getTime() ?? 0) - Date.now(),
    ).toBeGreaterThan(6.9 * DAY_MS);

    const appeal = await appeals.create(actor.user.id, {
      targetType: 'RESTRICTION',
      targetId: riskCase.id,
      reason: 'I am a real person organising an event',
    });
    await appeals.update(appeal.id, { status: 'APPROVED' }, adminId);

    const lifted = await prisma.riskCase.findUniqueOrThrow({
      where: { id: riskCase.id },
    });
    expect(lifted.restrictedUntil).toBeNull();
    expect(await redis.exists(trustKeys.restricted(pid))).toBe(0);
  });

  it('never evaluates Test Accounts', async () => {
    const tester = await newAccount({ isTestAccount: true });
    const pid = tester.profile.id;
    await redis.set(trustKeys.repeatedSignal(pid), '9', 'EX', 3600);
    await redis.set(trustKeys.coordinatedSignal(pid), '9', 'EX', 3600);

    expect(await detector.evaluateAndRecord(pid)).toBeNull();
    expect(await prisma.riskCase.count({ where: { profileId: pid } })).toBe(0);
  });
});
