import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanyVerificationService } from './company-verification.service.js';

const checks = vi.hoisted(() => ({
  askVies: vi.fn(),
  hasDnsProof: vi.fn(),
  hasMetaProof: vi.fn(),
}));
vi.mock('./company-checks.js', () => checks);
const fileType = vi.hoisted(() => ({ fileTypeFromBuffer: vi.fn() }));
vi.mock('file-type', () => fileType);

const owner = {
  accountType: 'BUSINESS',
  verificationLevel: 'BUSINESS',
  user: { identityVerifiedAt: new Date('2026-10-01') },
};

const application = (over: Record<string, unknown> = {}) => ({
  id: 'app-1',
  profileId: 'prof-1',
  status: 'DRAFT',
  kind: 'COMPANY',
  legalName: 'Acme SL',
  taxId: 'B12345674',
  domain: 'acme.es',
  viesValid: true,
  viesName: 'ACME SL',
  viesCheckedAt: new Date(),
  domainToken: 'tok',
  domainProvedAt: null,
  domainProof: null,
  emailAddress: null,
  emailCodeHash: null,
  emailCodeExpiresAt: null,
  emailCodeTries: 0,
  emailVerifiedAt: null,
  ...over,
});

const hash = (code: string) =>
  createHash('sha256').update(`app-1:${code}`).digest('hex');

describe('CompanyVerificationService', () => {
  let prisma: any;
  let crypto: { encrypt: ReturnType<typeof vi.fn> };
  let email: { sendCompanyDomainCode: ReturnType<typeof vi.fn> };
  let service: CompanyVerificationService;
  // The application being filled in, as the "open" lookup finds it.
  let open: ReturnType<typeof application> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    open = null;
    prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue(owner) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: 'ana@example.com' }),
      },
      companyVerification: {
        findFirst: vi.fn(({ where }: { where: { status: unknown } }) =>
          Promise.resolve(
            (where.status as { in?: unknown })?.in
              ? open
              : open
                ? { ...open, documents: [] }
                : null,
          ),
        ),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      companyVerificationDocument: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    };
    crypto = { encrypt: vi.fn((text: string) => `enc(${text})`) };
    email = { sendCompanyDomainCode: vi.fn().mockResolvedValue(undefined) };
    service = new CompanyVerificationService(
      prisma,
      crypto as never,
      email as never,
    );
    checks.askVies.mockResolvedValue({ valid: true, name: 'ACME SL' });
  });

  const details = {
    kind: 'COMPANY' as const,
    legalName: '  Acme SL ',
    taxId: 'b-12345674',
    domain: 'https://www.acme.es/',
  };

  describe('who can apply', () => {
    it('only the owner of the Profile in use: anyone else finds no Profile', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);
      await expect(
        service.saveDetails('u-1', 'prof-1', details),
      ).rejects.toMatchObject({ errorCode: 'PROFILE_NOT_FOUND' });
      expect(prisma.profile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prof-1', userId: 'u-1' } }),
      );
    });

    it('a session without a Profile has none', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);
      await service.status('u-1', '');
      expect(prisma.profile.findFirst.mock.calls[0][0].where.id).toBe(
        '__no_profile__',
      );
    });

    it('a Business Profile on the Business plan only', async () => {
      prisma.profile.findFirst.mockResolvedValue({
        ...owner,
        verificationLevel: 'ELITE',
      });
      await expect(
        service.saveDetails('u-1', 'prof-1', details),
      ).rejects.toMatchObject({ errorCode: 'PLAN_REQUIRED' });
    });

    it('with a verified identity', async () => {
      prisma.profile.findFirst.mockResolvedValue({
        ...owner,
        user: { identityVerifiedAt: null },
      });
      await expect(
        service.saveDetails('u-1', 'prof-1', details),
      ).rejects.toMatchObject({ errorCode: 'IDENTITY_VERIFICATION_REQUIRED' });
    });

    it('says so before anything is asked', async () => {
      prisma.profile.findFirst.mockResolvedValue({
        ...owner,
        accountType: 'CREATOR',
        user: { identityVerifiedAt: null },
      });
      await expect(service.status('u-1', 'prof-1')).resolves.toMatchObject({
        isOwner: true,
        onBusinessPlan: false,
        identityVerified: false,
        application: null,
        dnsRecord: null,
        metaTag: null,
      });
    });
  });

  describe('the company', () => {
    it('starts the application with the details cleaned, a code for the domain and what VIES says', async () => {
      await service.saveDetails('u-1', 'prof-1', details);

      expect(checks.askVies).toHaveBeenCalledWith('B12345674');
      const data = prisma.companyVerification.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        profileId: 'prof-1',
        kind: 'COMPANY',
        legalName: 'Acme SL',
        taxId: 'B12345674',
        domain: 'acme.es',
        viesValid: true,
        viesName: 'ACME SL',
      });
      expect(data.domainToken).toMatch(/^[0-9a-f]{32}$/);
      expect(data.viesCheckedAt).toBeInstanceOf(Date);
    });

    it('goes on when VIES cannot answer: it helps and never blocks', async () => {
      checks.askVies.mockResolvedValue(null);
      await service.saveDetails('u-1', 'prof-1', details);
      expect(
        prisma.companyVerification.create.mock.calls[0][0].data,
      ).toMatchObject({ viesValid: null, viesName: null, viesCheckedAt: null });
    });

    it('refuses a tax ID that is not valid for the kind', async () => {
      await expect(
        service.saveDetails('u-1', 'prof-1', {
          ...details,
          taxId: '12345678Z',
        }),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_TAX_ID_INVALID' });
    });

    it('refuses a domain that is not public, and a company without one', async () => {
      await expect(
        service.saveDetails('u-1', 'prof-1', {
          ...details,
          domain: '10.0.0.1',
        }),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_DOMAIN_INVALID' });
      await expect(
        service.saveDetails('u-1', 'prof-1', { ...details, domain: ' ' }),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_DOMAIN_INVALID' });
    });

    it('lets a sole trader apply without a domain', async () => {
      await service.saveDetails('u-1', 'prof-1', {
        kind: 'SOLE_TRADER',
        legalName: 'Ana Ruiz',
        taxId: '12345678Z',
        domain: null,
      });
      expect(
        prisma.companyVerification.create.mock.calls[0][0].data,
      ).toMatchObject({ kind: 'SOLE_TRADER', domain: null });
    });

    it('changes the details of the draft; the same tax ID is not sent to VIES again', async () => {
      open = application();
      await service.saveDetails('u-1', 'prof-1', {
        ...details,
        legalName: 'Acme Spain SL',
        domain: 'acme.es',
      });
      expect(checks.askVies).not.toHaveBeenCalled();
      const data = prisma.companyVerification.update.mock.calls[0][0].data;
      expect(data).toEqual({
        kind: 'COMPANY',
        legalName: 'Acme Spain SL',
        taxId: 'B12345674',
        domain: 'acme.es',
      });
    });

    it('asks VIES again when it could not answer before', async () => {
      open = application({ viesCheckedAt: null, viesValid: null });
      await service.saveDetails('u-1', 'prof-1', details);
      expect(checks.askVies).toHaveBeenCalledTimes(1);
      expect(
        prisma.companyVerification.update.mock.calls[0][0].data,
      ).toMatchObject({ viesValid: true });
    });

    it('a new domain starts its proof and its code again', async () => {
      open = application({
        domainProvedAt: new Date(),
        emailVerifiedAt: new Date(),
      });
      await service.saveDetails('u-1', 'prof-1', {
        ...details,
        domain: 'acme.com',
      });
      expect(
        prisma.companyVerification.update.mock.calls[0][0].data,
      ).toMatchObject({
        domain: 'acme.com',
        domainProvedAt: null,
        emailVerifiedAt: null,
        emailCodeTries: 0,
      });
    });

    it('an application sent cannot be changed', async () => {
      open = application({ status: 'PENDING' });
      await expect(
        service.saveDetails('u-1', 'prof-1', details),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_VERIFICATION_LOCKED' });
    });

    it('two starts at once leave one application, and other database errors are not hidden', async () => {
      prisma.companyVerification.create.mockRejectedValueOnce({
        code: 'P2002',
      });
      await expect(
        service.saveDetails('u-1', 'prof-1', details),
      ).resolves.toBeDefined();
      prisma.companyVerification.create.mockRejectedValueOnce(
        new Error('down'),
      );
      await expect(
        service.saveDetails('u-1', 'prof-1', details),
      ).rejects.toThrow('down');
    });

    it('shows the owner the DNS record and the meta tag to add', async () => {
      open = application();
      await expect(service.status('u-1', 'prof-1')).resolves.toMatchObject({
        dnsRecord: 'circlesfera-verification=tok',
        metaTag: '<meta name="circlesfera-verification" content="tok">',
        application: expect.objectContaining({ id: 'app-1' }),
      });
      // Never the documents' content, the code or its hash.
      const select =
        prisma.companyVerification.findFirst.mock.calls.at(-1)[0].select;
      expect(select.emailCodeHash).toBeUndefined();
      expect(select.documents.select.content).toBeUndefined();
    });
  });

  describe('the domain', () => {
    it('is proved by the DNS record first, then by the meta tag', async () => {
      open = application();
      checks.hasDnsProof.mockResolvedValueOnce(true);
      await service.checkDomain('u-1', 'prof-1');
      expect(checks.hasMetaProof).not.toHaveBeenCalled();
      expect(
        prisma.companyVerification.update.mock.calls[0][0].data,
      ).toMatchObject({ domainProof: 'DNS' });

      checks.hasDnsProof.mockResolvedValueOnce(false);
      checks.hasMetaProof.mockResolvedValueOnce(true);
      await service.checkDomain('u-1', 'prof-1');
      expect(checks.hasMetaProof).toHaveBeenCalledWith('acme.es', 'tok');
      expect(
        prisma.companyVerification.update.mock.calls[1][0].data,
      ).toMatchObject({ domainProof: 'META' });
    });

    it('says when neither is found, and when there is no domain', async () => {
      open = application();
      checks.hasDnsProof.mockResolvedValue(false);
      checks.hasMetaProof.mockResolvedValue(false);
      await expect(service.checkDomain('u-1', 'prof-1')).rejects.toMatchObject({
        errorCode: 'COMPANY_DOMAIN_NOT_PROVED',
      });
      open = application({ domain: null });
      await expect(service.checkDomain('u-1', 'prof-1')).rejects.toMatchObject({
        errorCode: 'COMPANY_DOMAIN_INVALID',
      });
    });
  });

  describe('the code sent to an address on the domain', () => {
    it('goes to that address, in the language of the person who applies, kept only as a hash', async () => {
      open = application();
      await service.sendEmailCode('u-1', 'prof-1', 'Info');

      const [to, code, applicant] = email.sendCompanyDomainCode.mock.calls[0];
      expect(to).toBe('info@acme.es');
      expect(code).toMatch(/^\d{6}$/);
      expect(applicant).toBe('ana@example.com');
      const data = prisma.companyVerification.update.mock.calls[0][0].data;
      expect(data.emailAddress).toBe('info@acme.es');
      expect(data.emailCodeHash).toBe(hash(code));
      expect(data.emailCodeTries).toBe(0);
      expect(data.emailCodeExpiresAt.getTime()).toBeGreaterThan(
        Date.now() + 29 * 60 * 1000,
      );
    });

    it('refuses an address part that is not valid, or an application without a domain', async () => {
      open = application();
      await expect(
        service.sendEmailCode('u-1', 'prof-1', 'a@b'),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_DOMAIN_INVALID' });
      open = application({ domain: null });
      await expect(
        service.sendEmailCode('u-1', 'prof-1', 'info'),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_DOMAIN_INVALID' });
      expect(email.sendCompanyDomainCode).not.toHaveBeenCalled();
    });

    it('is confirmed with the right code before it expires', async () => {
      open = application({
        emailCodeHash: hash('123456'),
        emailCodeExpiresAt: new Date(Date.now() + 60_000),
      });
      await service.confirmEmailCode('u-1', 'prof-1', '123456');
      expect(
        prisma.companyVerification.update.mock.calls[0][0].data,
      ).toMatchObject({ emailCodeHash: null, emailCodeExpiresAt: null });
      expect(
        prisma.companyVerification.update.mock.calls[0][0].data.emailVerifiedAt,
      ).toBeInstanceOf(Date);
    });

    it('a wrong or expired code uses a try; five tries end it', async () => {
      open = application({
        emailCodeHash: hash('123456'),
        emailCodeExpiresAt: new Date(Date.now() + 60_000),
      });
      await expect(
        service.confirmEmailCode('u-1', 'prof-1', '654321'),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_EMAIL_CODE_INVALID' });
      expect(prisma.companyVerification.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: { emailCodeTries: { increment: 1 } },
      });

      open = application({
        emailCodeHash: hash('123456'),
        emailCodeExpiresAt: new Date(Date.now() - 1),
      });
      await expect(
        service.confirmEmailCode('u-1', 'prof-1', '123456'),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_EMAIL_CODE_INVALID' });

      open = application({
        emailCodeHash: hash('123456'),
        emailCodeExpiresAt: new Date(Date.now() + 60_000),
        emailCodeTries: 5,
      });
      await expect(
        service.confirmEmailCode('u-1', 'prof-1', '123456'),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_EMAIL_CODE_TRIES' });
    });

    it('is refused when none was sent', async () => {
      open = application();
      await expect(
        service.confirmEmailCode('u-1', 'prof-1', '123456'),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_EMAIL_CODE_INVALID' });
    });
  });

  describe('documents', () => {
    const file = (over: Record<string, unknown> = {}) => ({
      originalname: 'CIF Acme (2026).pdf',
      size: 1000,
      buffer: Buffer.from('%PDF-1.7'),
      ...over,
    });

    it('are kept encrypted, named by their content, never in public storage', async () => {
      open = application();
      fileType.fileTypeFromBuffer.mockResolvedValue({
        mime: 'application/pdf',
        ext: 'pdf',
      });
      await service.addDocument('u-1', 'prof-1', file());
      expect(prisma.companyVerificationDocument.create).toHaveBeenCalledWith({
        data: {
          verificationId: 'app-1',
          fileName: 'CIF_Acme_2026_.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1000,
          content: `enc(${Buffer.from('%PDF-1.7').toString('base64')})`,
        },
      });
    });

    it('a file with no usable name gets one', async () => {
      open = application();
      fileType.fileTypeFromBuffer.mockResolvedValue({
        mime: 'image/png',
        ext: 'png',
      });
      await service.addDocument('u-1', 'prof-1', file({ originalname: '' }));
      expect(
        prisma.companyVerificationDocument.create.mock.calls[0][0].data
          .fileName,
      ).toBe('document.png');
      await service.addDocument('u-1', 'prof-1', file({ originalname: '***' }));
      expect(
        prisma.companyVerificationDocument.create.mock.calls[1][0].data
          .fileName,
      ).toBe('_.png');
    });

    it('refuses an empty or large file, another type, and a fourth one', async () => {
      open = application();
      await expect(
        service.addDocument('u-1', 'prof-1', undefined),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_DOCUMENT_INVALID' });
      await expect(
        service.addDocument('u-1', 'prof-1', file({ size: 6 * 1024 * 1024 })),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_DOCUMENT_INVALID' });
      fileType.fileTypeFromBuffer.mockResolvedValueOnce({
        mime: 'application/zip',
        ext: 'zip',
      });
      await expect(
        service.addDocument('u-1', 'prof-1', file()),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_DOCUMENT_INVALID' });
      fileType.fileTypeFromBuffer.mockResolvedValueOnce(undefined);
      await expect(
        service.addDocument('u-1', 'prof-1', file()),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_DOCUMENT_INVALID' });
      fileType.fileTypeFromBuffer.mockResolvedValueOnce({
        mime: 'image/jpeg',
        ext: 'jpg',
      });
      prisma.companyVerificationDocument.count.mockResolvedValueOnce(3);
      await expect(
        service.addDocument('u-1', 'prof-1', file()),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_DOCUMENTS_FULL' });
      expect(prisma.companyVerificationDocument.create).not.toHaveBeenCalled();
    });

    it('are removed from the draft only', async () => {
      open = application();
      await service.removeDocument('u-1', 'prof-1', 'doc-1');
      expect(
        prisma.companyVerificationDocument.deleteMany,
      ).toHaveBeenCalledWith({
        where: { id: 'doc-1', verificationId: 'app-1' },
      });
      prisma.companyVerificationDocument.deleteMany.mockResolvedValueOnce({
        count: 0,
      });
      await expect(
        service.removeDocument('u-1', 'prof-1', 'doc-x'),
      ).rejects.toMatchObject({ errorCode: 'COMPANY_VERIFICATION_NOT_FOUND' });
    });
  });

  describe('sending and withdrawing', () => {
    it('names every step missing', async () => {
      open = application();
      await expect(service.submit('u-1', 'prof-1')).rejects.toMatchObject({
        errorCode: 'COMPANY_VERIFICATION_INCOMPLETE',
        details: { missing: ['domain', 'email', 'documents'] },
      });
    });

    it('sends a complete application to staff', async () => {
      open = application({
        domainProvedAt: new Date(),
        emailVerifiedAt: new Date(),
      });
      prisma.companyVerificationDocument.count.mockResolvedValue(1);
      await service.submit('u-1', 'prof-1');
      expect(
        prisma.companyVerification.update.mock.calls[0][0].data,
      ).toMatchObject({ status: 'PENDING' });
    });

    it('a sole trader without a domain needs only the documents', async () => {
      open = application({ kind: 'SOLE_TRADER', domain: null });
      prisma.companyVerificationDocument.count.mockResolvedValue(1);
      await expect(service.submit('u-1', 'prof-1')).resolves.toBeDefined();
    });

    it('there is nothing to act on without an application', async () => {
      await expect(service.submit('u-1', 'prof-1')).rejects.toMatchObject({
        errorCode: 'COMPANY_VERIFICATION_NOT_FOUND',
      });
      await expect(service.withdraw('u-1', 'prof-1')).rejects.toMatchObject({
        errorCode: 'COMPANY_VERIFICATION_NOT_FOUND',
      });
    });

    it('withdrawing deletes the documents with the application, even once sent', async () => {
      open = application({ status: 'PENDING' });
      await service.withdraw('u-1', 'prof-1');
      expect(
        prisma.companyVerificationDocument.deleteMany,
      ).toHaveBeenCalledWith({ where: { verificationId: 'app-1' } });
      expect(prisma.companyVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'WITHDRAWN' }),
        }),
      );
    });

    it('only the owner withdraws', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);
      await expect(service.withdraw('u-2', 'prof-1')).rejects.toMatchObject({
        errorCode: 'PROFILE_NOT_FOUND',
      });
    });
  });
});
