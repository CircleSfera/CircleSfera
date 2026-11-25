import { AD_CONSENT_TEXT_VERSION, ADS_CONSENT_FLAG } from '@circlesfera/shared';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/users/users.service.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// The consent to personalised ads (PD-084), against the database: asked of
// nobody while the flag is off, never of someone under 18, stored as proof,
// withdrawn as it is given, in the data export and erased with the account.
describe('Ads consent (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let csrfToken: string;
  let csrfCookie: string;

  const id = uniqueSuffix();
  // 17 today: 18 tomorrow. Old enough to sign up (16), too young for
  // personalised ads.
  const today = new Date();
  const minorDob = new Date(
    Date.UTC(
      today.getUTCFullYear() - 18,
      today.getUTCMonth(),
      today.getUTCDate() + 1,
    ),
  )
    .toISOString()
    .slice(0, 10);
  const adult = {
    email: `adsc_adult_${id}@example.com`,
    password: 'Password123!',
    username: `adsc_a_${id}`,
    dateOfBirth: '1990-01-15',
    locale: 'en',
  };
  const minor = {
    email: `adsc_minor_${id}@example.com`,
    password: 'Password123!',
    username: `adsc_m_${id}`,
    dateOfBirth: minorDob,
  };
  const emails = [adult.email, minor.email];
  const cookiesOf: Record<string, string[]> = {};

  const sessionCookies = (res: request.Response) =>
    ((res.get('Set-Cookie') as string[]) || []).map((c) => c.split(';')[0]);

  // As the app asks: with the version of the texts it carries.
  const get = (who: string, textVersion = AD_CONSENT_TEXT_VERSION) =>
    request(app.getHttpServer())
      .get('/api/v1/users/me/ads-consent')
      .query({ textVersion })
      .set('Cookie', cookiesOf[who]);

  const put = (who: string, body: object) =>
    request(app.getHttpServer())
      .put('/api/v1/users/me/ads-consent')
      .set('Cookie', cookiesOf[who])
      .set('x-csrf-token', csrfToken)
      .send({
        textVersion: AD_CONSENT_TEXT_VERSION,
        locale: 'en',
        source: 'PROMPT',
        ...body,
      });

  const userId = async (email: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { in: emails } } });

    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrfToken = csrfRes.body.csrfToken;
    csrfCookie =
      ((csrfRes.get('Set-Cookie') as string[]) || []).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';

    for (const [who, body] of [
      ['adult', adult],
      ['minor', minor],
    ] as const) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Cookie', [csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send(body)
        .expect(201);
      cookiesOf[who] = [csrfCookie, ...sessionCookies(res)];
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('the flag ships, and ships off', async () => {
    const flag = await prisma.featureFlag.findUnique({
      where: { key: ADS_CONSENT_FLAG },
    });
    expect(flag).not.toBeNull();
    expect(flag?.isEnabled).toBe(false);
    expect(flag?.percentage).toBe(0);
  });

  it('while the flag is off asks nobody and takes no answer', async () => {
    const res = await get('adult').expect(200);

    expect(res.body).toMatchObject({
      choice: null,
      askNow: false,
      effectiveChoice: 'GENERAL',
      personalisationAllowed: true,
      currentTextVersion: AD_CONSENT_TEXT_VERSION,
    });
    const refused = await put('adult', { choice: 'GENERAL' }).expect(403);
    expect(refused.body.errorCode).toBe('FEATURE_DISABLED');
    expect(
      await prisma.adConsent.count({
        where: { userId: await userId(adult.email) },
      }),
    ).toBe(0);
  });

  it('with the flag on for them, asks the adult and never the minor', async () => {
    for (const email of emails) {
      await prisma.userExperiment.create({
        data: {
          userId: await userId(email),
          experimentKey: ADS_CONSENT_FLAG,
          variant: 'on',
        },
      });
    }

    const adultStatus = await get('adult').expect(200);
    const minorStatus = await get('minor').expect(200);

    expect(adultStatus.body.askNow).toBe(true);
    // An app with other texts (an older bundle) is not asked.
    const older = await get('adult', 'older-texts').expect(200);
    expect(older.body.askNow).toBe(false);
    expect(minorStatus.body).toMatchObject({
      askNow: false,
      personalisationAllowed: false,
      effectiveChoice: 'GENERAL',
    });
  });

  it('refuses personalised ads for the minor and stores nothing', async () => {
    const res = await put('minor', { choice: 'PERSONALISED' }).expect(403);

    expect(res.body.errorCode).toBe('AD_PERSONALISATION_UNDER_AGE');
    expect(
      await prisma.adConsent.count({
        where: { userId: await userId(minor.email) },
      }),
    ).toBe(0);
  });

  it('the last answer written is the one in force, even when two share a millisecond', async () => {
    const id = await userId(minor.email);
    const at = new Date('2026-12-01T10:00:00.000Z');
    const row = {
      userId: id,
      textVersion: AD_CONSENT_TEXT_VERSION,
      locale: 'en' as const,
      source: 'SETTINGS' as const,
      createdAt: at,
    };
    // Written first, with the id that sorts last: a random tie-break on the
    // id would take it for the latest.
    await prisma.adConsent.create({
      data: {
        ...row,
        id: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
        choice: 'PERSONALISED',
      },
    });
    await prisma.adConsent.create({
      data: {
        ...row,
        id: '00000000-0000-4000-8000-000000000000',
        choice: 'GENERAL',
      },
    });

    const res = await get('minor').expect(200);
    expect(res.body.choice).toBe('GENERAL');
    await prisma.adConsent.deleteMany({ where: { userId: id } });
  });

  it('refuses a choice that is not one of the two, or texts not in force', async () => {
    await put('adult', { choice: 'EVERYTHING' }).expect(400);
    await put('adult', { choice: 'GENERAL', textVersion: 'old' }).expect(409);
  });

  it('stores the answer as proof, stops asking, and withdraws as it gives', async () => {
    const given = await put('adult', { choice: 'PERSONALISED' }).expect(200);
    expect(given.body).toMatchObject({
      choice: 'PERSONALISED',
      effectiveChoice: 'PERSONALISED',
      askNow: false,
    });

    const withdrawn = await put('adult', {
      choice: 'GENERAL',
      source: 'SETTINGS',
    }).expect(200);
    expect(withdrawn.body).toMatchObject({
      choice: 'GENERAL',
      effectiveChoice: 'GENERAL',
      askNow: false,
    });

    const rows = await prisma.adConsent.findMany({
      where: { userId: await userId(adult.email) },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toEqual([
      expect.objectContaining({
        choice: 'PERSONALISED',
        textVersion: AD_CONSENT_TEXT_VERSION,
        locale: 'en',
        source: 'PROMPT',
        createdAt: expect.any(Date),
      }),
      expect.objectContaining({ choice: 'GENERAL', source: 'SETTINGS' }),
    ]);
  });

  it('is in the data export and erased with the account', async () => {
    const users = app.get(UsersService);
    const id = await userId(adult.email);

    const exported = (await users.exportUserData(id)) as {
      adConsents: { choice: string }[];
    };
    expect(exported.adConsents.map((a) => a.choice)).toEqual([
      'PERSONALISED',
      'GENERAL',
    ]);

    await prisma.user.update({
      where: { id },
      data: { isActive: false, scheduledDeletionAt: new Date() },
    });
    await expect(users.deleteScheduledUser(id)).resolves.toBe(true);
    expect(await prisma.adConsent.count({ where: { userId: id } })).toBe(0);
  });

  it('needs a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/me/ads-consent')
      .expect(401);
  });
});
