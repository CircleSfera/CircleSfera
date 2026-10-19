import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminOperatorsService } from './admin-operators.service.js';
import { UNUSED_STAFF_PASSWORD_HASH } from './staff-password.constants.js';

describe('AdminOperatorsService', () => {
  let service: AdminOperatorsService;
  let prisma: any;
  let proof: {
    sendLink: ReturnType<typeof vi.fn>;
    issueCode: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = {
      adminIdentity: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
      signIn: { findUnique: vi.fn() },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
      adminRefreshToken: { deleteMany: vi.fn().mockResolvedValue({}) },
    };
    proof = {
      sendLink: vi.fn().mockResolvedValue(undefined),
      issueCode: vi.fn().mockResolvedValue('ABCD-EFGH-JKLM'),
    };
    service = new AdminOperatorsService(
      prisma as unknown as PrismaService,
      proof as never,
    );
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
      // The person enrols their authenticator with the link sent to them.
      expect(proof.sendLink).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'op-1', email: 'person@example.com' }),
      );
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ADMIN_ENROLMENT_ISSUED',
          targetId: 'op-1',
        }),
      });
    });

    it('keeps the new operator when the link cannot be sent, so it can be sent again', async () => {
      prisma.signIn.findUnique.mockResolvedValue({ userId: 'user-9' });
      prisma.adminIdentity.create.mockResolvedValue({
        id: 'op-1',
        email: 'person@example.com',
        roles: [],
      });
      proof.sendLink.mockRejectedValueOnce(new Error('queue down'));

      await expect(
        service.createOperator('actor-1', dto),
      ).resolves.toMatchObject({ id: 'op-1' });
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ADMIN_ENROLMENT_ISSUED' }),
      });
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

  describe('enrolment proofs', () => {
    const awaiting = {
      id: 'op-1',
      email: 'p@example.com',
      totpEnabled: false,
      status: 'ACTIVE',
    };

    it('resetting the authenticator forgets the old proof and sends a new link', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue({ id: 'op-1' });
      prisma.adminIdentity.update.mockResolvedValue({ ...awaiting, roles: [] });

      await service.resetMfa('actor-1', 'op-1');

      expect(prisma.adminIdentity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            totpSecret: null,
            totpEnabled: false,
            enrolmentProofHash: null,
            enrolmentProofExpiresAt: null,
          },
        }),
      );
      expect(proof.sendLink).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'op-1', email: 'p@example.com' }),
      );
    });

    it('sends the link again, and audits it', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(awaiting);

      await expect(
        service.sendEnrolmentLinkAgain('actor-1', 'op-1'),
      ).resolves.toEqual({ sent: true });
      expect(proof.sendLink).toHaveBeenCalledWith(awaiting);
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'actor-1',
          action: 'ADMIN_ENROLMENT_ISSUED',
          targetId: 'op-1',
        }),
      });
    });

    it('issues a code shown only in its answer, and audits it without the code', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(awaiting);

      await expect(
        service.issueEnrolmentCode('actor-1', 'op-1'),
      ).resolves.toEqual({ code: 'ABCD-EFGH-JKLM', expiresInHours: 24 });
      const [{ data }] = prisma.adminAuditLog.create.mock.calls[0];
      expect(data.action).toBe('ADMIN_ENROLMENT_ISSUED');
      expect(JSON.stringify(data)).not.toContain('ABCD');
    });

    it.each([
      ['an unknown operator', null],
      [
        'an operator who already has an authenticator',
        { ...awaiting, totpEnabled: true },
      ],
      ['an operator who is not active', { ...awaiting, status: 'DISABLED' }],
    ])('issues nothing for %s', async (_name, found) => {
      prisma.adminIdentity.findUnique.mockResolvedValue(found);

      await expect(
        service.issueEnrolmentCode('actor-1', 'op-1'),
      ).rejects.toThrow();
      await expect(
        service.sendEnrolmentLinkAgain('actor-1', 'op-1'),
      ).rejects.toThrow();
      expect(proof.issueCode).not.toHaveBeenCalled();
      expect(proof.sendLink).not.toHaveBeenCalled();
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
