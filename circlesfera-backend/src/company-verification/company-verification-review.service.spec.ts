import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanyVerificationReviewService } from './company-verification-review.service.js';

describe('CompanyVerificationReviewService', () => {
  let prisma: any;
  let crypto: { decrypt: ReturnType<typeof vi.fn> };
  let email: { sendCompanyVerificationDecided: ReturnType<typeof vi.fn> };
  let events: { emit: ReturnType<typeof vi.fn> };
  let service: CompanyVerificationReviewService;

  beforeEach(() => {
    prisma = {
      companyVerification: {
        findMany: vi.fn().mockResolvedValue([{ id: 'app-1' }]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue({ id: 'app-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          profileId: 'prof-1',
          rejectionReason: 'DETAILS_DO_NOT_MATCH',
          rejectionNote: 'The CIF ends in 4.',
          profile: { user: { email: 'ana@example.com' } },
        }),
      },
      companyVerificationDocument: {
        findFirst: vi.fn().mockResolvedValue({
          fileName: 'cif.pdf',
          contentType: 'application/pdf',
          content: 'enc',
        }),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    crypto = {
      decrypt: vi.fn(() => Buffer.from('%PDF-1.7').toString('base64')),
    };
    email = {
      sendCompanyVerificationDecided: vi.fn().mockResolvedValue(undefined),
    };
    events = { emit: vi.fn() };
    service = new CompanyVerificationReviewService(
      prisma,
      crypto as never,
      email as never,
      events as never,
    );
  });

  it('lists the applications waiting, oldest first, never with documents or the code', async () => {
    await expect(service.queue()).resolves.toEqual({
      items: [{ id: 'app-1' }],
      total: 1,
    });
    const query = prisma.companyVerification.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ status: 'PENDING' });
    expect(query.orderBy).toEqual({ submittedAt: 'asc' });
    expect(query.select.emailCodeHash).toBeUndefined();
    expect(query.select.documents.select.content).toBeUndefined();
  });

  it('shows one application, or says there is none', async () => {
    await expect(service.detail('app-1')).resolves.toEqual({ id: 'app-1' });
    prisma.companyVerification.findUnique.mockResolvedValueOnce(null);
    await expect(service.detail('app-x')).rejects.toMatchObject({
      errorCode: 'COMPANY_VERIFICATION_NOT_FOUND',
    });
  });

  it('opens a document of that application only, decrypted, and records who opened it', async () => {
    const file = await service.document('admin-1', 'app-1', 'doc-1');
    expect(file.content.toString()).toBe('%PDF-1.7');
    expect(file.contentType).toBe('application/pdf');
    expect(
      prisma.companyVerificationDocument.findFirst.mock.calls[0][0].where,
    ).toEqual({ id: 'doc-1', verificationId: 'app-1' });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: 'admin-1',
        action: 'COMPANY_DOCUMENT_VIEWED',
        targetId: 'app-1',
      }),
    });

    prisma.companyVerificationDocument.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.document('admin-1', 'app-1', 'doc-x'),
    ).rejects.toMatchObject({ errorCode: 'COMPANY_VERIFICATION_NOT_FOUND' });
  });

  it('approves a waiting application, deletes its documents, replaces an earlier approval and tells the person', async () => {
    await service.decide('admin-1', 'app-1', { approve: true });

    const decision = prisma.companyVerification.updateMany.mock.calls[0][0];
    expect(decision.where).toEqual({ id: 'app-1', status: 'PENDING' });
    expect(decision.data).toMatchObject({
      status: 'APPROVED',
      decidedById: 'admin-1',
      rejectionReason: null,
      rejectionNote: null,
    });
    expect(prisma.companyVerificationDocument.deleteMany).toHaveBeenCalledWith({
      where: { verificationId: 'app-1' },
    });
    expect(prisma.companyVerification.updateMany.mock.calls[1][0]).toEqual({
      where: {
        profileId: 'prof-1',
        status: 'APPROVED',
        id: { not: 'app-1' },
      },
      data: { status: 'REPLACED' },
    });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'COMPANY_VERIFICATION_APPROVED',
      }),
    });
    expect(events.emit).toHaveBeenCalledWith(
      'notification.create',
      expect.objectContaining({
        recipientId: 'prof-1',
        type: 'SYSTEM',
        notice: { key: 'company_verified' },
      }),
    );
    expect(email.sendCompanyVerificationDecided).toHaveBeenCalledWith(
      'ana@example.com',
      { key: 'company_verified' },
    );
  });

  it('rejects with a reason and a note the person reads, and replaces nothing', async () => {
    await service.decide('admin-1', 'app-1', {
      approve: false,
      reason: 'DETAILS_DO_NOT_MATCH',
      note: 'The CIF ends in 4.',
    });
    expect(
      prisma.companyVerification.updateMany.mock.calls[0][0].data,
    ).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'DETAILS_DO_NOT_MATCH',
      rejectionNote: 'The CIF ends in 4.',
    });
    expect(prisma.companyVerification.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.companyVerificationDocument.deleteMany).toHaveBeenCalled();
    expect(events.emit.mock.calls[0][1].notice).toEqual({
      key: 'company_rejected',
      reason: 'DETAILS_DO_NOT_MATCH',
      note: 'The CIF ends in 4.',
    });
  });

  it('a rejection without a reason is "other", and without a note has none', async () => {
    prisma.companyVerification.findUniqueOrThrow.mockResolvedValueOnce({
      profileId: 'prof-1',
      rejectionReason: null,
      rejectionNote: null,
      profile: { user: null },
    });
    await service.decide('admin-1', 'app-1', { approve: false });
    expect(
      prisma.companyVerification.updateMany.mock.calls[0][0].data,
    ).toMatchObject({ rejectionReason: 'OTHER', rejectionNote: null });
    expect(events.emit.mock.calls[0][1].notice).toEqual({
      key: 'company_rejected',
      reason: 'OTHER',
      note: null,
    });
    // A person with no address is told in the app only.
    expect(email.sendCompanyVerificationDecided).not.toHaveBeenCalled();
  });

  it('decides only an application that is waiting: once, never twice', async () => {
    prisma.companyVerification.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.decide('admin-1', 'app-1', { approve: true }),
    ).rejects.toMatchObject({ errorCode: 'COMPANY_VERIFICATION_LOCKED' });
    expect(
      prisma.companyVerificationDocument.deleteMany,
    ).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('a failed email does not undo the decision', async () => {
    email.sendCompanyVerificationDecided.mockRejectedValueOnce(new Error('x'));
    await expect(
      service.decide('admin-1', 'app-1', { approve: true }),
    ).resolves.toEqual({ id: 'app-1' });
  });
});
