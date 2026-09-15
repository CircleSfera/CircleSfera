import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { uniqueSuffix } from '../utils/unique-id.js';

describe('Media Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let userCookie: string;
  let userCsrf: string;

  const uniqueId = uniqueSuffix();
  const testUser = {
    email: `media_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `media_user_${uniqueId}`,
    dateOfBirth: '1990-01-01',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);

    // Register User
    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    userCsrf = csrfRes.body.csrfToken;
    const cookies = (csrfRes.get('Set-Cookie') as string[]) || [];
    userCookie = cookies.find((c) => c.startsWith('x-csrf-token=')) || '';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [userCookie])
      .set('x-csrf-token', userCsrf)
      .send(testUser)
      .expect(201);

    await prisma.user.update({
      where: { email: testUser.email },
      data: { emailVerified: new Date() },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [userCookie])
      .set('x-csrf-token', userCsrf)
      .send({ identifier: testUser.email, password: testUser.password })
      .expect(200);

    const authCookies = (loginRes.get('Set-Cookie') as string[]) || [];
    userCookie = [userCookie, ...authCookies].join('; ');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should block SVG file uploads (prevent XSS)', async () => {
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const filePath = join(__dirname, 'test-malicious.svg');
    writeFileSync(filePath, svgContent);

    try {
      await request(app.getHttpServer())
        .post('/api/v1/uploads')
        .set('Cookie', [userCookie])
        .set('x-csrf-token', userCsrf)
        .attach('file', filePath)
        .expect(400); // Bad Request because SVG is not in allowed mimetypes
    } finally {
      unlinkSync(filePath);
    }
  });

  it('should block Shell script uploads disguised as standard files', async () => {
    const shContent = '#!/bin/bash\necho "hacked"';
    const filePath = join(__dirname, 'test-malicious.sh');
    writeFileSync(filePath, shContent);

    try {
      await request(app.getHttpServer())
        .post('/api/v1/uploads')
        .set('Cookie', [userCookie])
        .set('x-csrf-token', userCsrf)
        .attach('file', filePath, {
          filename: 'test-malicious.png',
          contentType: 'image/png',
        })
        // NestJS ParseFilePipe uses fileType from mimetype or magic bytes.
        // We expect it to be blocked (400 Bad Request)
        .expect(400);
    } finally {
      unlinkSync(filePath);
    }
  });
});
