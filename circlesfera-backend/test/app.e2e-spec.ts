import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Unique user for this test run
  const uniqueId = Date.now();
  const testUser = {
    email: `e2e_test_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `e2e_user_${uniqueId}`,
    fullName: 'E2E Test User',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Cleanup
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
    await app.close();
  });

  it('/api/v1/auth/register (POST)', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201)
      .expect((res: request.Response) => {
        const cookies = res.get('Set-Cookie');
        expect(cookies).toBeDefined();
        if (cookies) {
          expect(cookies.some((c) => c.includes('access_token'))).toBe(true);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(res.body.message).toEqual('Registration successful');
      });
  });

  it('/api/v1/auth/login (POST)', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(200) // Login returns 200 OK, not 201 Created logic-wise usually, let's double check Controller. Controller says @HttpCode(HttpStatus.OK) which is 200.
      .expect((res: request.Response) => {
        const cookies = res.get('Set-Cookie');
        expect(cookies).toBeDefined();
        if (cookies) {
          expect(cookies.some((c) => c.includes('access_token'))).toBe(true);
        }
      });
  });

  it('/api/v1/auth/login (POST) - Fail with wrong password', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: 'WrongPassword!',
      })
      .expect(401);
  });
});
