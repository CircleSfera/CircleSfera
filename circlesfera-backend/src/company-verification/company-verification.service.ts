import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import {
  type CompanyKind,
  CompanyVerificationStatus,
  type Prisma,
} from '@prisma/client';
import { fileTypeFromBuffer } from 'file-type';
import { AppException } from '../common/errors/app.exception.js';
import { CryptoService } from '../common/services/crypto.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hasTeamPlan } from '../team/team-plan.js';
import { askVies, hasDnsProof, hasMetaProof } from './company-checks.js';
import { isValidLocalPart, normalizeDomain } from './company-domain.js';
import {
  DOCUMENT_TYPES,
  DOMAIN_META_NAME,
  DOMAIN_TXT_PREFIX,
  EMAIL_CODE_DIGITS,
  EMAIL_CODE_TRIES,
  EMAIL_CODE_TTL_MS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
} from './company-verification.constants.js';
import { isValidTaxId, normalizeTaxId } from './spanish-tax-id.js';

const OPEN: CompanyVerificationStatus[] = [
  CompanyVerificationStatus.DRAFT,
  CompanyVerificationStatus.PENDING,
];

// What the owner sees of an application: never the documents' content, the
// code sent by email or its hash.
const PUBLIC_SELECT = {
  id: true,
  status: true,
  kind: true,
  legalName: true,
  taxId: true,
  domain: true,
  viesValid: true,
  viesName: true,
  viesCheckedAt: true,
  domainToken: true,
  domainProvedAt: true,
  domainProof: true,
  emailAddress: true,
  emailCodeExpiresAt: true,
  emailVerifiedAt: true,
  submittedAt: true,
  decidedAt: true,
  createdAt: true,
  documents: {
    select: {
      id: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.CompanyVerificationSelect;

export type CompanyDetails = {
  kind: CompanyKind;
  legalName: string;
  taxId: string;
  domain?: string | null;
};

type UploadedDocument = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

// A Business Profile's application to show "Verified company": made by the
// owner of the Profile on the Business plan, with a verified identity.
// Staff decide on it in the Backoffice.
@Injectable()
export class CompanyVerificationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  // Whether the Profile in use can apply, and its latest application.
  async status(userId: string, profileId: string) {
    const eligibility = await this.eligibility(userId, profileId);
    const application = await this.prisma.companyVerification.findFirst({
      where: {
        profileId,
        status: { not: CompanyVerificationStatus.WITHDRAWN },
      },
      orderBy: { createdAt: 'desc' },
      select: PUBLIC_SELECT,
    });
    return {
      ...eligibility,
      dnsRecord: application
        ? `${DOMAIN_TXT_PREFIX}${application.domainToken}`
        : null,
      metaTag: application
        ? `<meta name="${DOMAIN_META_NAME}" content="${application.domainToken}">`
        : null,
      application,
    };
  }

  // Starts the application, or changes the details of the one being filled
  // in. Changing the domain starts its proof again. VIES is asked each
  // time the tax ID changes.
  async saveDetails(
    userId: string,
    profileId: string,
    details: CompanyDetails,
  ) {
    await this.assertEligible(userId, profileId);
    const taxId = normalizeTaxId(details.taxId);
    if (!isValidTaxId(taxId, details.kind)) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_TAX_ID_INVALID,
        'The tax ID is not valid',
      );
    }
    const domain = details.domain?.trim()
      ? normalizeDomain(details.domain)
      : null;
    if (details.domain?.trim() && !domain) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_DOMAIN_INVALID,
        'The domain is not valid',
      );
    }
    // A company shows it controls its website; a sole trader may have none.
    if (details.kind === 'COMPANY' && !domain) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_DOMAIN_INVALID,
        'A company gives the domain of its website',
      );
    }
    const legalName = details.legalName.trim();

    const current = await this.open(profileId);
    if (current && current.status !== CompanyVerificationStatus.DRAFT) {
      throw AppException.Conflict(
        ErrorCode.COMPANY_VERIFICATION_LOCKED,
        'The application was sent',
      );
    }

    // VIES is asked for a new tax ID, or again when it could not answer.
    const askAgain =
      !current || current.taxId !== taxId || !current.viesCheckedAt;
    const vies = askAgain ? await askVies(taxId) : null;
    const viesFields = askAgain
      ? {
          viesValid: vies?.valid ?? null,
          viesName: vies?.name ?? null,
          viesCheckedAt: vies ? new Date() : null,
        }
      : {};
    const domainChanged = !current || current.domain !== domain;
    const domainFields = domainChanged
      ? {
          domainProvedAt: null,
          domainProof: null,
          emailAddress: null,
          emailCodeHash: null,
          emailCodeExpiresAt: null,
          emailCodeTries: 0,
          emailVerifiedAt: null,
        }
      : {};

    if (current) {
      await this.prisma.companyVerification.update({
        where: { id: current.id },
        data: {
          kind: details.kind,
          legalName,
          taxId,
          domain,
          ...viesFields,
          ...domainFields,
        },
      });
    } else {
      await this.prisma.companyVerification
        .create({
          data: {
            profileId,
            kind: details.kind,
            legalName,
            taxId,
            domain,
            domainToken: randomBytes(16).toString('hex'),
            ...viesFields,
          },
        })
        .catch((err: unknown) => {
          // Two starts at once: the other one made the application, which
          // the database keeps to one per Profile.
          if ((err as { code?: string })?.code !== 'P2002') throw err;
        });
    }
    return this.status(userId, profileId);
  }

  // Looks for the DNS record, then the meta tag, with the application's
  // code on its domain.
  async checkDomain(userId: string, profileId: string) {
    await this.assertEligible(userId, profileId);
    const application = await this.draft(profileId);
    if (!application.domain) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_DOMAIN_INVALID,
        'The application has no domain',
      );
    }
    const proof = (await hasDnsProof(
      application.domain,
      application.domainToken,
    ))
      ? 'DNS'
      : (await hasMetaProof(application.domain, application.domainToken))
        ? 'META'
        : null;
    if (!proof) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_DOMAIN_NOT_PROVED,
        'Neither the DNS record nor the meta tag was found',
      );
    }
    await this.prisma.companyVerification.update({
      where: { id: application.id },
      data: { domainProvedAt: new Date(), domainProof: proof },
    });
    return this.status(userId, profileId);
  }

  // Sends a code to an address on the application's domain. A new code
  // replaces the one before, with all its tries.
  async sendEmailCode(userId: string, profileId: string, localPart: string) {
    await this.assertEligible(userId, profileId);
    const application = await this.draft(profileId);
    if (!application.domain || !isValidLocalPart(localPart)) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_DOMAIN_INVALID,
        'The address is not on the domain',
      );
    }
    const address = `${localPart.toLowerCase()}@${application.domain}`;
    const code = String(randomInt(0, 10 ** EMAIL_CODE_DIGITS)).padStart(
      EMAIL_CODE_DIGITS,
      '0',
    );
    await this.prisma.companyVerification.update({
      where: { id: application.id },
      data: {
        emailAddress: address,
        emailCodeHash: this.hashCode(application.id, code),
        emailCodeExpiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
        emailCodeTries: 0,
        emailVerifiedAt: null,
      },
    });
    const applicant = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    await this.email.sendCompanyDomainCode(address, code, applicant?.email);
    return this.status(userId, profileId);
  }

  // Checks the code typed back. Five tries per code.
  async confirmEmailCode(userId: string, profileId: string, code: string) {
    await this.assertEligible(userId, profileId);
    const application = await this.draft(profileId);
    if (!application.emailCodeHash || !application.emailCodeExpiresAt) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_EMAIL_CODE_INVALID,
        'No code was sent',
      );
    }
    if (application.emailCodeTries >= EMAIL_CODE_TRIES) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_EMAIL_CODE_TRIES,
        'No tries are left for this code',
      );
    }
    const expected = Buffer.from(application.emailCodeHash, 'hex');
    const given = Buffer.from(this.hashCode(application.id, code), 'hex');
    const right =
      application.emailCodeExpiresAt.getTime() > Date.now() &&
      expected.length === given.length &&
      timingSafeEqual(expected, given);
    if (!right) {
      await this.prisma.companyVerification.update({
        where: { id: application.id },
        data: { emailCodeTries: { increment: 1 } },
      });
      throw AppException.BadRequest(
        ErrorCode.COMPANY_EMAIL_CODE_INVALID,
        'The code is wrong or expired',
      );
    }
    await this.prisma.companyVerification.update({
      where: { id: application.id },
      data: {
        emailVerifiedAt: new Date(),
        emailCodeHash: null,
        emailCodeExpiresAt: null,
      },
    });
    return this.status(userId, profileId);
  }

  // Keeps a document, encrypted, until staff decide. PDF, JPG or PNG, told
  // by its content, not by its name.
  async addDocument(
    userId: string,
    profileId: string,
    file: UploadedDocument | undefined,
  ) {
    await this.assertEligible(userId, profileId);
    const application = await this.draft(profileId);
    if (!file?.buffer?.length || file.size > MAX_DOCUMENT_BYTES) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_DOCUMENT_INVALID,
        'The document is empty or too large',
      );
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    if (
      !detected ||
      !(DOCUMENT_TYPES as readonly string[]).includes(detected.mime)
    ) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_DOCUMENT_INVALID,
        'Only PDF, JPG and PNG documents are accepted',
      );
    }
    const count = await this.prisma.companyVerificationDocument.count({
      where: { verificationId: application.id },
    });
    if (count >= MAX_DOCUMENTS) {
      throw AppException.Conflict(
        ErrorCode.COMPANY_DOCUMENTS_FULL,
        `At most ${MAX_DOCUMENTS} documents`,
        { max: MAX_DOCUMENTS },
      );
    }
    await this.prisma.companyVerificationDocument.create({
      data: {
        verificationId: application.id,
        fileName: this.safeFileName(file.originalname, detected.ext),
        contentType: detected.mime,
        sizeBytes: file.size,
        content: this.crypto.encrypt(file.buffer.toString('base64')),
      },
    });
    return this.status(userId, profileId);
  }

  async removeDocument(userId: string, profileId: string, documentId: string) {
    await this.assertEligible(userId, profileId);
    const application = await this.draft(profileId);
    const { count } = await this.prisma.companyVerificationDocument.deleteMany({
      where: { id: documentId, verificationId: application.id },
    });
    if (count === 0) {
      throw AppException.NotFound(
        ErrorCode.COMPANY_VERIFICATION_NOT_FOUND,
        'Document not found',
      );
    }
    return this.status(userId, profileId);
  }

  // Sends the application to staff once every step is done: the identity,
  // the documents and, when there is a domain, its proof and the code.
  async submit(userId: string, profileId: string) {
    await this.assertEligible(userId, profileId);
    const application = await this.draft(profileId);
    const documents = await this.prisma.companyVerificationDocument.count({
      where: { verificationId: application.id },
    });
    const missing: string[] = [];
    if (application.domain && !application.domainProvedAt) {
      missing.push('domain');
    }
    if (application.domain && !application.emailVerifiedAt) {
      missing.push('email');
    }
    if (documents === 0) missing.push('documents');
    if (missing.length > 0) {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_VERIFICATION_INCOMPLETE,
        'The application is not complete',
        { missing },
      );
    }
    await this.prisma.companyVerification.update({
      where: { id: application.id },
      data: {
        status: CompanyVerificationStatus.PENDING,
        submittedAt: new Date(),
      },
    });
    return this.status(userId, profileId);
  }

  // Withdraws the application being filled in or waiting for staff; its
  // documents are deleted with it.
  async withdraw(userId: string, profileId: string) {
    await this.assertOwner(userId, profileId);
    const application = await this.open(profileId);
    if (!application) {
      throw AppException.NotFound(
        ErrorCode.COMPANY_VERIFICATION_NOT_FOUND,
        'No application to withdraw',
      );
    }
    await this.prisma.$transaction([
      this.prisma.companyVerificationDocument.deleteMany({
        where: { verificationId: application.id },
      }),
      this.prisma.companyVerification.update({
        where: { id: application.id },
        data: {
          status: CompanyVerificationStatus.WITHDRAWN,
          emailCodeHash: null,
          emailCodeExpiresAt: null,
        },
      }),
    ]);
    return this.status(userId, profileId);
  }

  private async eligibility(userId: string, profileId: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId || '__no_profile__', userId },
      select: {
        accountType: true,
        verificationLevel: true,
        user: { select: { identityVerifiedAt: true } },
      },
    });
    return {
      isOwner: !!profile,
      onBusinessPlan: !!profile && hasTeamPlan(profile),
      identityVerified: !!profile?.user?.identityVerifiedAt,
    };
  }

  private async assertOwner(userId: string, profileId: string) {
    const { isOwner } = await this.eligibility(userId, profileId);
    if (!isOwner) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
      );
    }
  }

  // The owner of a Business Profile on the Business plan, whose identity
  // is verified.
  private async assertEligible(userId: string, profileId: string) {
    const { isOwner, onBusinessPlan, identityVerified } =
      await this.eligibility(userId, profileId);
    if (!isOwner) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
      );
    }
    if (!onBusinessPlan) {
      throw AppException.Forbidden(
        ErrorCode.PLAN_REQUIRED,
        'Company verification comes with the Business plan',
        { plan: 'Business' },
      );
    }
    if (!identityVerified) {
      throw AppException.Forbidden(
        ErrorCode.IDENTITY_VERIFICATION_REQUIRED,
        'Verify your identity first',
      );
    }
  }

  private open(profileId: string) {
    return this.prisma.companyVerification.findFirst({
      where: { profileId, status: { in: OPEN } },
    });
  }

  // The application being filled in; one already sent cannot change.
  private async draft(profileId: string) {
    const application = await this.open(profileId);
    if (!application) {
      throw AppException.NotFound(
        ErrorCode.COMPANY_VERIFICATION_NOT_FOUND,
        'No application',
      );
    }
    if (application.status !== CompanyVerificationStatus.DRAFT) {
      throw AppException.Conflict(
        ErrorCode.COMPANY_VERIFICATION_LOCKED,
        'The application was sent',
      );
    }
    return application;
  }

  private hashCode(applicationId: string, code: string) {
    return createHash('sha256')
      .update(`${applicationId}:${code.trim()}`)
      .digest('hex');
  }

  // A name for staff to recognise the file: letters, digits, dots, dashes
  // and underscores, at most 100 characters, with the extension of its
  // content.
  private safeFileName(original: string, ext: string) {
    const base = (original || 'document')
      .replace(/\.[^.]*$/, '')
      .replace(/[^\p{L}\p{N}._-]+/gu, '_')
      .slice(0, 90);
    return `${base || 'document'}.${ext}`;
  }
}
