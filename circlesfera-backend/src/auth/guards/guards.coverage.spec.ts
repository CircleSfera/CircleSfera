import { ApiErrorCode, ErrorCode } from '@circlesfera/shared';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { EmailVerifiedGuard } from './email-verified.guard.js';
import { IdentityVerifiedGuard } from './identity-verified.guard.js';
import { JwtOptionalGuard } from './jwt-optional.guard.js';
import { SubscriptionGuard } from './subscription.guard.js';

const contextFor = (user: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('EmailVerifiedGuard', () => {
  const prisma = { user: { findUnique: vi.fn() } };
  const settings = { isEnabled: vi.fn() };
  const turnstile = { incrementEmailForbidden: vi.fn() };
  const guard = new EmailVerifiedGuard(
    prisma as never,
    settings as never,
    turnstile as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    settings.isEnabled.mockResolvedValue(true);
  });

  it('lets everyone through when email verification is not required', async () => {
    settings.isEnabled.mockResolvedValue(false);
    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a request without a signed-in user', async () => {
    await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets a verified account through', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerified: new Date() });
    await expect(
      guard.canActivate(contextFor({ userId: 'u-1' })),
    ).resolves.toBe(true);
  });

  it('refuses an unverified account and counts it', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerified: null });

    const error = await guard
      .canActivate(contextFor({ userId: 'u-1' }))
      .catch((e) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toEqual({
      message: ApiErrorCode.EMAIL_NOT_VERIFIED,
    });
    expect(turnstile.incrementEmailForbidden).toHaveBeenCalledTimes(1);
  });
});

describe('JwtOptionalGuard', () => {
  const guard = new JwtOptionalGuard();

  it('returns the user when authentication succeeded', () => {
    expect(guard.handleRequest(null, { userId: 'u-1' })).toEqual({
      userId: 'u-1',
    });
  });

  it('returns null instead of failing when there is no valid session', () => {
    expect(guard.handleRequest(new Error('expired'), { userId: 'u-1' })).toBe(
      null,
    );
    expect(guard.handleRequest(null, false)).toBeNull();
  });
});

describe('IdentityVerifiedGuard', () => {
  const prisma = { user: { findUnique: vi.fn() } };
  const guard = new IdentityVerifiedGuard(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('refuses a request without a signed-in user', async () => {
    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses an unknown or inactive account', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      guard.canActivate(contextFor({ userId: 'u-1' })),
    ).rejects.toThrow(ForbiddenException);

    prisma.user.findUnique.mockResolvedValueOnce({
      isActive: false,
      identityVerifiedAt: new Date(),
    });
    await expect(
      guard.canActivate(contextFor({ userId: 'u-1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses an account without a verified identity with its own error code', async () => {
    prisma.user.findUnique.mockResolvedValue({
      isActive: true,
      identityVerifiedAt: null,
    });

    const refusal = await guard
      .canActivate(contextFor({ userId: 'u-1' }))
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(AppException);
    expect((refusal as AppException).getStatus()).toBe(403);
    // The code is what the app reads; the sentence is kept for app versions
    // from before the code existed.
    expect((refusal as AppException).getResponse()).toMatchObject({
      errorCode: ErrorCode.IDENTITY_VERIFICATION_REQUIRED,
      message:
        'Debes verificar tu identidad primero para poder comprar o cobrar.',
    });
  });

  it('lets an active, verified account through', async () => {
    prisma.user.findUnique.mockResolvedValue({
      isActive: true,
      identityVerifiedAt: new Date(),
    });
    await expect(
      guard.canActivate(contextFor({ userId: 'u-1' })),
    ).resolves.toBe(true);
  });
});

describe('SubscriptionGuard', () => {
  const prisma = {
    platformPlan: { findFirst: vi.fn() },
    platformSubscription: { findFirst: vi.fn() },
  };
  const reflector = { getAllAndOverride: vi.fn() };
  const guard = new SubscriptionGuard(
    prisma as never,
    reflector as unknown as Reflector,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue('Premium');
    prisma.platformPlan.findFirst.mockResolvedValue({
      name: 'Premium',
      priceCents: 999,
    });
  });

  it('lets everyone through on routes without a plan requirement', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
  });

  it('refuses a request without a signed-in user', async () => {
    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(false);
  });

  it('never lets a participant account through because of its role', async () => {
    prisma.platformSubscription.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(contextFor({ userId: 'u-1', role: 'ADMIN' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses when the required plan does not exist', async () => {
    prisma.platformPlan.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(contextFor({ userId: 'u-1' })),
    ).resolves.toBe(false);
  });

  it('refuses a lower plan and accepts the same or a higher one', async () => {
    prisma.platformSubscription.findFirst.mockResolvedValueOnce({
      plan: { name: 'Basic', priceCents: 499 },
    });
    await expect(
      guard.canActivate(contextFor({ userId: 'u-1' })),
    ).rejects.toThrow(ForbiddenException);

    prisma.platformSubscription.findFirst.mockResolvedValueOnce({
      plan: { name: 'Business', priceCents: 4999 },
    });
    await expect(
      guard.canActivate(contextFor({ userId: 'u-1' })),
    ).resolves.toBe(true);
  });
});
