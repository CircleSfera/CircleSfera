import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  REQUIRE_OWNERSHIP_KEY,
  type RequireOwnershipOptions,
} from '../decorators/require-ownership.decorator.js';
import { OwnershipGuard } from './ownership.guard.js';

describe('OwnershipGuard', () => {
  let guard: OwnershipGuard;
  let reflector: Reflector;
  const postFindUnique = vi.fn();
  const exportFindUnique = vi.fn();

  const ctx = (
    req: { user?: unknown; params?: Record<string, string> },
    options?: RequireOwnershipOptions,
  ) => {
    const handler = () => undefined;
    if (options) {
      Reflect.defineMetadata(REQUIRE_OWNERSHIP_KEY, options, handler);
    }
    return {
      switchToHttp: () => ({
        getRequest: () => ({ params: {}, ...req }),
      }),
      getHandler: () => handler,
      getClass: () => class {},
    } as never;
  };

  beforeEach(() => {
    reflector = new Reflector();
    postFindUnique.mockReset();
    exportFindUnique.mockReset();
    guard = new OwnershipGuard(reflector, {
      post: { findUnique: postFindUnique },
      dataExportRequest: { findUnique: exportFindUnique },
    } as unknown as PrismaService);
  });

  it('allows routes without RequireOwnership', async () => {
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
    expect(postFindUnique).not.toHaveBeenCalled();
  });

  it('denies missing session or incomplete user data', async () => {
    await expect(
      guard.canActivate(
        ctx({ user: {} }, { model: 'Post', userIdField: 'profileId' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      guard.canActivate(
        ctx(
          { user: { userId: 'u1' } }, // missing profileId
          { model: 'Post', userIdField: 'profileId' },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies missing route param', async () => {
    await expect(
      guard.canActivate(
        ctx(
          { user: { userId: 'u1', profileId: 'p1' }, params: {} },
          { model: 'Post', userIdField: 'profileId' },
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('denies when the resource is missing', async () => {
    postFindUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(
        ctx(
          {
            user: { userId: 'u1', profileId: 'p1' },
            params: { id: 'post-1' },
          },
          { model: 'Post', userIdField: 'profileId' },
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies when profileId does not own the post', async () => {
    postFindUnique.mockResolvedValue({ profileId: 'other-profile' });
    await expect(
      guard.canActivate(
        ctx(
          {
            user: { userId: 'u1', profileId: 'p1' },
            params: { id: 'post-1' },
          },
          { model: 'Post', userIdField: 'profileId' },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the profile owner for profile-based models (Post)', async () => {
    postFindUnique.mockResolvedValue({ profileId: 'p1' });
    await expect(
      guard.canActivate(
        ctx(
          {
            user: { userId: 'u1', profileId: 'p1' },
            params: { id: 'post-1' },
          },
          { model: 'Post', userIdField: 'profileId' },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('correctly validates user-level ownership (userId) without profileId mismatch', async () => {
    // User has userId 'u1' and profileId 'p1'
    exportFindUnique.mockResolvedValue({ userId: 'u1' });

    await expect(
      guard.canActivate(
        ctx(
          {
            user: { userId: 'u1', profileId: 'p1' },
            params: { id: 'export-1' },
          },
          { model: 'DataExportRequest' },
        ),
      ),
    ).resolves.toBe(true);

    expect(exportFindUnique).toHaveBeenCalledWith({
      where: { id: 'export-1' },
      select: { userId: true },
    });
  });

  it('denies when userId does not match for user-level models', async () => {
    exportFindUnique.mockResolvedValue({ userId: 'other-user' });

    await expect(
      guard.canActivate(
        ctx(
          {
            user: { userId: 'u1', profileId: 'p1' },
            params: { id: 'export-1' },
          },
          { model: 'DataExportRequest' },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unsupported Prisma models with BadRequestException', async () => {
    await expect(
      guard.canActivate(
        ctx(
          {
            user: { userId: 'u1', profileId: 'p1' },
            params: { id: 'res-1' },
          },
          { model: 'NonExistentModel' as any },
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
