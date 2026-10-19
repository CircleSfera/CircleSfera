import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReportTargetType } from '../src/reports/dto/create-report.dto.js';
import { ReportsService } from '../src/reports/reports.service.js';
import { createProfile, createUserWithProfile } from './factories/index.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

// Anyone may read a public profile, without a session. What they read never
// tells who the person behind it is, so two Profiles of one person cannot be
// linked, nor how the Profile was sanctioned or how it is set up. A report
// names the Profile, and is kept against the person behind it.
describe('Public profile fields (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let reporterUserId: string;
  let main: { id: string; username: string };
  let hobby: { id: string; username: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    const person = await createUserWithProfile(prisma);
    userId = person.user.id;
    main = person.profile;
    hobby = await createProfile(prisma, userId);
    await prisma.profile.update({
      where: { id: hobby.id },
      data: {
        accountBanReason: 'What staff wrote about this Profile',
        sanctionedAt: new Date(),
        pushMessages: false,
      },
    });
    // The person signed up long before either Profile was created.
    await prisma.user.update({
      where: { id: userId },
      data: { createdAt: new Date('2020-01-01T00:00:00.000Z') },
    });
    reporterUserId = (await createUserWithProfile(prisma)).user.id;
  });

  afterAll(async () => {
    await prisma.report.deleteMany({ where: { targetId: userId } });
    await prisma.user.deleteMany({
      where: { id: { in: [userId, reporterUserId] } },
    });
    await app.close();
  });

  it('never tells, without a session, who the person behind a Profile is or how it was sanctioned', async () => {
    const answers = await Promise.all(
      [main, hobby].map((p) =>
        request(app.getHttpServer())
          .get(`/api/v1/profiles/${p.username}`)
          .expect(200),
      ),
    );

    for (const { body, text } of answers) {
      expect(text).not.toContain(userId);
      for (const hidden of [
        'userId',
        'signInId',
        'user',
        'accountBanReason',
        'banStrikeId',
        'suspensionStrikeId',
        'suspensionCause',
        'sanctionedAt',
        'pushMessages',
        'pushNotifications',
      ]) {
        expect(body).not.toHaveProperty(hidden);
      }
    }
    expect(answers.map((a) => a.body.id)).toEqual([main.id, hobby.id]);
    expect(answers[1].text).not.toContain('What staff wrote');
    // Each Profile is dated by its own creation, not by the person's
    // sign-up, which is the same on all their Profiles.
    for (const { text } of answers) {
      expect(text).not.toContain('2020-01-01');
    }
  });

  it('keeps a report of a Profile against the person behind it', async () => {
    const reporter = await prisma.profile.findFirstOrThrow({
      where: { userId: reporterUserId },
      select: { id: true },
    });

    const report = await app.get(ReportsService).create(reporter.id, {
      targetType: ReportTargetType.USER,
      targetId: hobby.id,
      reason: 'SPAM',
    });

    // Kept against the person; the reporter is never told who that is.
    const stored = await prisma.report.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(stored.targetId).toBe(userId);
    expect(JSON.stringify(report)).not.toContain(userId);
    const mine = await app
      .get(ReportsService)
      .findMyReports(reporter.id, { page: 1, limit: 20 });
    expect(JSON.stringify(mine)).not.toContain(userId);
  });
});
