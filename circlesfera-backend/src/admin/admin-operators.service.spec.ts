import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminOperatorsService } from './admin-operators.service.js';
import { UNUSED_STAFF_PASSWORD_HASH } from './staff-password.constants.js';

describe('AdminOperatorsService', () => {
  let service: AdminOperatorsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      adminIdentity: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
      signIn: { findUnique: vi.fn() },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    service = new AdminOperatorsService(prisma as unknown as PrismaService);
  });

  describe('createOperator', () => {
    const dto = {
      email: ' Person@Example.com ',
      displayName: 'Person',
      roleIds: ['arole_support'],
    };

    it('links the CircleSfera account with that email and stores no password of its own', async () => {
      prisma.signIn.findUnique.mockResolvedValue({ userId: 'user-9' });
      prisma.adminIdentity.create.mockResolvedValue({
        id: 'op-1',
        email: 'person@example.com',
        roles: [],
      });

      await service.createOperator('actor-1', dto);

      expect(prisma.signIn.findUnique).toHaveBeenCalledWith({
        where: { email: 'person@example.com' },
        select: { userId: true },
      });
      expect(prisma.adminIdentity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'person@example.com',
            linkedUserId: 'user-9',
            passwordHash: UNUSED_STAFF_PASSWORD_HASH,
          }),
        }),
      );
    });

    it('refuses an email with no CircleSfera account', async () => {
      prisma.signIn.findUnique.mockResolvedValue(null);

      await expect(service.createOperator('actor-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.adminIdentity.create).not.toHaveBeenCalled();
    });

    it('refuses an email that already is an operator', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue({ id: 'op-0' });

      await expect(service.createOperator('actor-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('unlock', () => {
    it('clears the lockout and leaves the password alone', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue({ id: 'op-1' });
      prisma.adminIdentity.update.mockResolvedValue({
        id: 'op-1',
        email: 'person@example.com',
        roles: [],
      });

      await service.unlock('actor-1', 'op-1');

      expect(prisma.adminIdentity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'op-1' },
          data: { failedLoginCount: 0, lockedUntil: null },
        }),
      );
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'MANUAL_OVERRIDE' }),
      });
    });

    it('refuses an unknown operator', async () => {
      await expect(service.unlock('actor-1', 'nope')).rejects.toThrow(
        'Operator not found',
      );
    });
  });
});
