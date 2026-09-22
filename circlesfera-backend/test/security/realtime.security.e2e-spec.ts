import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  AppGateway,
  type SocketWithAuth,
} from '../../src/socket/app.gateway.js';
import { uniqueSuffix } from '../utils/unique-id.js';

describe('Realtime Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let appGateway: AppGateway;

  const uniqueId = uniqueSuffix();
  const testUser = {
    email: `realtime_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `realtime_${uniqueId}`,
    dateOfBirth: '1991-03-25',
  };

  let validToken: string;
  let testUserId: string;
  let testProfileId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    appGateway = app.get(AppGateway);

    // Initialize mock server on gateway if not attached by test runtime
    if (!appGateway.server) {
      appGateway.server = {
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        emit: vi.fn(),
        sockets: new Map(),
      } as unknown as AppGateway['server'];
    }

    // Register active user
    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    const csrfToken = csrfRes.body.csrfToken;
    const cookies = (csrfRes.get('Set-Cookie') as string[]) || [];
    const csrfCookie = cookies.find((c) => c.startsWith('x-csrf-token=')) || '';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(testUser)
      .expect(201);

    const userRecord = await prisma.user.findUnique({
      where: { email: testUser.email },
      include: { profiles: true },
    });

    if (!userRecord?.profiles[0]) {
      throw new Error('Failed to create test user fixture');
    }

    testUserId = userRecord.id;
    testProfileId = userRecord.profiles[0].id;

    // Generate valid JWT
    validToken = jwtService.sign(
      { sub: testUserId, email: testUser.email },
      {
        secret:
          process.env.JWT_SECRET || 'circlesfera-jwt-secret-for-test-32char',
      },
    );
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    }
    if (app) await app.close();
  });

  function createMockSocket(
    cookieHeader?: string,
    authHeader?: string,
    originHeader?: string,
  ): SocketWithAuth {
    return {
      id: `sock_${uniqueSuffix()}`,
      handshake: {
        headers: {
          cookie: cookieHeader,
          authorization: authHeader,
          ...(originHeader !== undefined ? { origin: originHeader } : {}),
        },
      },
      disconnect: vi.fn(),
      join: vi.fn().mockResolvedValue(undefined),
      emit: vi.fn(),
      data: {} as SocketWithAuth['data'],
    } as unknown as SocketWithAuth;
  }

  it('should disconnect socket client when no authentication token is provided', async () => {
    const client = createMockSocket();

    await appGateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.data?.user).toBeUndefined();
  });

  it('should disconnect socket client when an invalid/forged token is provided', async () => {
    const client = createMockSocket('access_token=invalid.forged.jwt.token');

    await appGateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.data?.user).toBeUndefined();
  });

  it('should disconnect socket client when the user account is deactivated', async () => {
    // Temporarily mark user as deactivated
    await prisma.user.update({
      where: { id: testUserId },
      data: { isActive: false },
    });

    const client = createMockSocket(`access_token=${validToken}`);

    try {
      await appGateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.data?.user).toBeUndefined();
    } finally {
      // Restore active state
      await prisma.user.update({
        where: { id: testUserId },
        data: { isActive: true },
      });
    }
  });

  it('should disconnect socket client when the user profile is currently suspended', async () => {
    // Suspend profile for 24 hours
    const futureSuspension = new Date(Date.now() + 24 * 3600 * 1000);
    await prisma.profile.update({
      where: { id: testProfileId },
      data: { suspendedUntil: futureSuspension },
    });

    const client = createMockSocket(`access_token=${validToken}`);

    try {
      await appGateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.data?.user).toBeUndefined();
    } finally {
      // Clear suspension
      await prisma.profile.update({
        where: { id: testProfileId },
        data: { suspendedUntil: null },
      });
    }
  });

  it('should authenticate valid active client, join rooms and populate session', async () => {
    const client = createMockSocket(`access_token=${validToken}`);

    await appGateway.handleConnection(client);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.user).toBeDefined();
    expect(client.data.user.sub).toBe(testUserId);
    expect(client.data.user.profileId).toBe(testProfileId);
    expect(client.join).toHaveBeenCalledWith(`user:${testProfileId}`);
    expect(client.join).toHaveBeenCalledWith(`presence:${testProfileId}`);
  });

  it('should silently drop typing events for conversations the client does not belong to', async () => {
    const client = createMockSocket(`access_token=${validToken}`);
    await appGateway.handleConnection(client);

    const emitSpy = vi.fn();
    const toSpy = vi.fn().mockReturnValue({ emit: emitSpy });
    appGateway.server = {
      ...appGateway.server,
      to: toSpy,
    } as unknown as AppGateway['server'];

    // Client attempts to emit typing for an un-joined/unauthorized conversation
    await appGateway.handleTypingStart(
      {
        conversationId: 'unauthorized-conv-id',
        recipientId: 'recipient-profile-id',
      },
      client,
    );

    expect(emitSpy).not.toHaveBeenCalled();
    expect(toSpy).not.toHaveBeenCalledWith('user:recipient-profile-id');
  });

  it('should silently drop mark_read events for conversations the client does not belong to', async () => {
    const client = createMockSocket(`access_token=${validToken}`);
    await appGateway.handleConnection(client);

    const emitSpy = vi.fn();
    const toSpy = vi.fn().mockReturnValue({ emit: emitSpy });
    appGateway.server = {
      ...appGateway.server,
      to: toSpy,
    } as unknown as AppGateway['server'];

    await appGateway.handleMarkRead(
      {
        conversationId: 'unauthorized-conv-id',
        recipientId: 'recipient-profile-id',
      },
      client,
    );

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should immediately disconnect client and drop session when Origin is unauthorized (CSWSH guard)', async () => {
    const client = createMockSocket(
      `access_token=${validToken}`,
      undefined,
      'https://malicious-cross-site-attacker.com',
    );

    await appGateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.data?.user).toBeUndefined();
  });

  it('should accept connection when Origin is in allowed origins whitelist', async () => {
    const client = createMockSocket(
      `access_token=${validToken}`,
      undefined,
      'http://localhost:5173',
    );

    await appGateway.handleConnection(client);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.user).toBeDefined();
    expect(client.data.user.sub).toBe(testUserId);
  });
});
