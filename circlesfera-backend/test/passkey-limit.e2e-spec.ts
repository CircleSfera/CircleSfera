import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { MAX_PASSKEYS_PER_SIGN_IN } from '../src/auth/passkey/passkey.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// A sign-in may register a limited number of passkeys; past it the server
// refuses to start another registration. Each sign-in of an account counts
// its own.
describe('Passkey limit per sign-in (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let csrfToken: string;
  let csrfCookie: string;
  let cookies: string[];
  let userId: string;

  const id = uniqueSuffix();
  const account = {
    email: `pk_limit_${id}@example.com`,
    password: 'Password123!',
    username: `pk_limit_${id}`,
    dateOfBirth: '1990-01-15',
  };

  const registerOptions = () =>
    request(app.getHttpServer())
      .post('/api/v1/auth/passkey/register-options')
      .set('Cookie', cookies)
      .set('x-csrf-token', csrfToken);

  // Without a sign-in named, a passkey goes to the account's first one.
  const addStoredPasskeys = (count: number, from: number, signInId?: string) =>
    prisma.passkey.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        userId,
        ...(signInId ? { signInId } : {}),
        credentialID: `pk-limit-${id}-${from + i}`,
        publicKey: Buffer.from('test-key'),
        counter: BigInt(0),
      })),
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
    await prisma.user.deleteMany({ where: { email: account.email } });

    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrfToken = csrfRes.body.csrfToken;
    csrfCookie =
      ((csrfRes.get('Set-Cookie') as string[]) || []).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(account)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ identifier: account.email, password: account.password })
      .expect(200);
    cookies = [
      csrfCookie,
      ...((login.get('Set-Cookie') as string[]) || []).map(
        (c) => c.split(';')[0],
      ),
    ];
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: account.email },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: account.email } });
    await app.close();
  });

  it("another sign-in's passkeys do not count towards this sign-in's limit", async () => {
    const other = await prisma.signIn.create({
      data: {
        userId,
        email: `pk_limit_other_${id}@example.com`,
        password: 'hash',
      },
      select: { id: true },
    });
    await addStoredPasskeys(MAX_PASSKEYS_PER_SIGN_IN, 100, other.id);

    await registerOptions().expect(201);
  });

  it('starts a registration while the sign-in is below the limit', async () => {
    await addStoredPasskeys(MAX_PASSKEYS_PER_SIGN_IN - 1, 0);

    const res = await registerOptions().expect(201);

    expect(typeof res.body.challenge).toBe('string');
  });

  it('refuses another registration once the sign-in is at the limit', async () => {
    await addStoredPasskeys(1, MAX_PASSKEYS_PER_SIGN_IN);

    const res = await registerOptions().expect(409);

    expect(res.body).toMatchObject({
      errorCode: 'PASSKEY_LIMIT_REACHED',
      details: { max: MAX_PASSKEYS_PER_SIGN_IN },
    });
  });
});
