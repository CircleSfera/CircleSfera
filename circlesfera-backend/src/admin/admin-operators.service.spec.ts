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
      roles: [],
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
            enrolmentProofPasswordMark: null,
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
  describe('external reviewers', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const reviewerDto = {
      email: 'stripereview@circlesfera.com',
      displayName: 'Stripe review',
      roleIds: ['arole_external_reviewer'],
    };
    const created = () =>
      prisma.adminIdentity.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'rev-1',
          ...data,
          roles: [
            {
              role: {
                id: 'arole_external_reviewer',
                name: 'EXTERNAL_REVIEWER',
              },
            },
          ],
        }),
      );

    beforeEach(() => {
      prisma.signIn.findUnique.mockResolvedValue({ userId: 'user-9' });
      prisma.$transaction = vi.fn().mockResolvedValue([]);
      prisma.adminIdentityRole = {
        deleteMany: vi.fn().mockReturnValue('delete-roles'),
        createMany: vi.fn().mockReturnValue('create-roles'),
      };
      prisma.adminIdentity.findUniqueOrThrow = vi.fn();
    });

    it('is given 30 days by default, and no authenticator link', async () => {
      created();
      const result = await service.createOperator('actor-1', reviewerDto);

      const { data } = prisma.adminIdentity.create.mock.calls[0][0];
      const days = (data.accessExpiresAt.getTime() - Date.now()) / DAY;
      expect(days).toBeGreaterThan(29.99);
      expect(days).toBeLessThanOrEqual(30);
      expect(proof.sendLink).not.toHaveBeenCalled();
      expect(result).toMatchObject({ externalReviewer: true });
    });

    it('takes an end date asked for, up to 90 days', async () => {
      created();
      const end = new Date(Date.now() + 10 * DAY).toISOString();
      await service.createOperator('actor-1', {
        ...reviewerDto,
        accessExpiresAt: end,
      });
      expect(
        prisma.adminIdentity.create.mock.calls[0][0].data.accessExpiresAt,
      ).toEqual(new Date(end));

      await expect(
        service.createOperator('actor-1', {
          ...reviewerDto,
          accessExpiresAt: new Date(Date.now() + 91 * DAY).toISOString(),
        }),
      ).rejects.toThrow(/90 days/);
    });

    it('never holds the role with another', async () => {
      await expect(
        service.createOperator('actor-1', {
          ...reviewerDto,
          roleIds: ['arole_external_reviewer', 'arole_support'],
        }),
      ).rejects.toThrow(/cannot be combined/);
      expect(prisma.adminIdentity.create).not.toHaveBeenCalled();
    });

    it('an end in the past is refused for anyone; a member of staff may have none', async () => {
      await expect(
        service.createOperator('actor-1', {
          email: 'p@example.com',
          displayName: 'P',
          roleIds: ['arole_support'],
          accessExpiresAt: new Date(Date.now() - DAY).toISOString(),
        }),
      ).rejects.toThrow(/future/);

      prisma.adminIdentity.create.mockResolvedValue({ id: 'op-1', roles: [] });
      await service.createOperator('actor-1', {
        email: 'p@example.com',
        displayName: 'P',
        roleIds: ['arole_support'],
      });
      expect(
        prisma.adminIdentity.create.mock.calls[0][0].data.accessExpiresAt,
      ).toBeNull();
    });

    it('has no authenticator to enrol', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'rev-1',
        totpEnabled: false,
        status: 'ACTIVE',
        roles: [{ roleId: 'arole_external_reviewer' }],
      });
      await expect(
        service.sendEnrolmentLinkAgain('actor-1', 'rev-1'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.issueEnrolmentCode('actor-1', 'rev-1'),
      ).rejects.toThrow(ConflictException);
    });

    describe('access end', () => {
      const identity = (roleId: string) =>
        prisma.adminIdentity.findUnique.mockResolvedValue({
          id: 'rev-1',
          roles: [{ roleId }],
        });
      beforeEach(() => {
        prisma.adminIdentity.update.mockImplementation(
          async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'rev-1',
            ...data,
            roles: [],
          }),
        );
      });

      it("extends a reviewer's access, and writes it down", async () => {
        identity('arole_external_reviewer');
        const end = new Date(Date.now() + 20 * DAY).toISOString();

        await service.setAccessExpiry('actor-1', 'rev-1', end);

        expect(prisma.adminIdentity.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { accessExpiresAt: new Date(end) } }),
        );
        expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: 'ADMIN_ACCESS_EXPIRY_SET',
            targetId: 'rev-1',
          }),
        });
      });

      it('never leaves a reviewer without an end', async () => {
        identity('arole_external_reviewer');
        await expect(
          service.setAccessExpiry('actor-1', 'rev-1', null),
        ).rejects.toThrow(/always has an end/);
        expect(prisma.adminIdentity.update).not.toHaveBeenCalled();
      });

      it('lets a member of staff have no end', async () => {
        identity('arole_support');
        await service.setAccessExpiry('actor-1', 'rev-1', null);
        expect(prisma.adminIdentity.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { accessExpiresAt: null } }),
        );
        expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ details: 'Access has no end' }),
        });
      });

      it('is not changed by its own holder, nor for someone unknown', async () => {
        identity('arole_support');
        await expect(
          service.setAccessExpiry('rev-1', 'rev-1', null),
        ).rejects.toThrow(/your own/);
        prisma.adminIdentity.findUnique.mockResolvedValue(null);
        await expect(
          service.setAccessExpiry('actor-1', 'nobody', null),
        ).rejects.toThrow(/not found/);
      });
    });

    describe('changing roles', () => {
      const rolesAfter = (roleId: string, totpEnabled = false) =>
        prisma.adminIdentity.findUniqueOrThrow.mockResolvedValue({
          id: 'op-1',
          email: 'p@example.com',
          totpEnabled,
          roles: [{ role: { id: roleId, name: 'X' } }],
        });

      it('becoming a reviewer gives an end and ends the sessions', async () => {
        prisma.adminIdentity.findUnique.mockResolvedValue({
          id: 'op-1',
          accessExpiresAt: null,
          roles: [{ roleId: 'arole_support' }],
        });
        rolesAfter('arole_external_reviewer');

        await service.replaceRoles('actor-1', 'op-1', [
          'arole_external_reviewer',
        ]);

        const { data } = prisma.adminIdentity.update.mock.calls[0][0];
        expect(data.accessExpiresAt.getTime()).toBeGreaterThan(
          Date.now() + 29 * DAY,
        );
        expect(prisma.adminRefreshToken.deleteMany).toHaveBeenCalledWith({
          where: { adminId: 'op-1' },
        });
        expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(4);
        expect(proof.sendLink).not.toHaveBeenCalled();
      });

      it('becoming a reviewer with an end already past gives a new one', async () => {
        prisma.adminIdentity.findUnique.mockResolvedValue({
          id: 'op-1',
          accessExpiresAt: new Date(Date.now() - DAY),
          roles: [{ roleId: 'arole_support' }],
        });
        rolesAfter('arole_external_reviewer');

        await service.replaceRoles('actor-1', 'op-1', [
          'arole_external_reviewer',
        ]);

        const { data } = prisma.adminIdentity.update.mock.calls[0][0];
        expect(data.accessExpiresAt.getTime()).toBeGreaterThan(
          Date.now() + 29 * DAY,
        );
      });

      it('a reviewer keeps an end already within 90 days', async () => {
        const end = new Date(Date.now() + 5 * DAY);
        prisma.adminIdentity.findUnique.mockResolvedValue({
          id: 'op-1',
          accessExpiresAt: end,
          roles: [{ roleId: 'arole_external_reviewer' }],
        });
        rolesAfter('arole_external_reviewer');

        await service.replaceRoles('actor-1', 'op-1', [
          'arole_external_reviewer',
        ]);

        expect(prisma.adminIdentity.update.mock.calls[0][0].data).toEqual({
          accessExpiresAt: end,
        });
        // Still a reviewer: the sessions are not ended.
        expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(3);
      });

      it('no longer a reviewer: the sessions end and the authenticator link is sent', async () => {
        prisma.adminIdentity.findUnique.mockResolvedValue({
          id: 'op-1',
          accessExpiresAt: new Date(Date.now() + DAY),
          roles: [{ roleId: 'arole_external_reviewer' }],
        });
        rolesAfter('arole_support');

        await service.replaceRoles('actor-1', 'op-1', ['arole_support']);

        expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(4);
        expect(proof.sendLink).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'op-1' }),
        );
      });

      it('a member of staff with an authenticator changing roles gets no link', async () => {
        prisma.adminIdentity.findUnique.mockResolvedValue({
          id: 'op-1',
          accessExpiresAt: null,
          roles: [{ roleId: 'arole_support' }],
        });
        rolesAfter('arole_content', true);

        await service.replaceRoles('actor-1', 'op-1', ['arole_content']);

        expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(3);
        expect(proof.sendLink).not.toHaveBeenCalled();
      });

      it('refuses someone unknown', async () => {
        prisma.adminIdentity.findUnique.mockResolvedValue(null);
        await expect(
          service.replaceRoles('actor-1', 'op-1', ['arole_support']),
        ).rejects.toThrow(/not found/);
      });
    });
  });
});
