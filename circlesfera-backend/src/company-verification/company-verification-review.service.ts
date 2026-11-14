import { ErrorCode, type NotificationCreateEvent } from '@circlesfera/shared';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AdminAction,
  CompanyVerificationStatus,
  NotificationType,
  type Prisma,
} from '@prisma/client';
import { emailForProfile } from '../common/auth/sign-in-lookup.js';
import { AppException } from '../common/errors/app.exception.js';
import { CryptoService } from '../common/services/crypto.service.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { EmailService } from '../email/email.service.js';
import type { Notice } from '../notifications/notice-copy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { forgetProfileView } from './company-mark.js';
import type { DecideCompanyDto } from './dto/decide-company.dto.js';

const QUEUE_PAGE = 50;

// What staff see of an application: never the documents' content or the
// email code.
const STAFF_SELECT = {
  id: true,
  status: true,
  kind: true,
  legalName: true,
  taxId: true,
  domain: true,
  viesValid: true,
  viesName: true,
  viesCheckedAt: true,
  domainProvedAt: true,
  domainProof: true,
  emailAddress: true,
  emailVerifiedAt: true,
  submittedAt: true,
  decidedAt: true,
  decidedById: true,
  rejectionReason: true,
  rejectionNote: true,
  createdAt: true,
  profile: {
    select: {
      id: true,
      username: true,
      accountType: true,
      verificationLevel: true,
      user: { select: { identityVerifiedAt: true } },
    },
  },
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

// Staff decide on company verifications in the Backoffice. A decision
// deletes the documents; only the outcome is kept.
@Injectable()
export class CompanyVerificationReviewService {
  private readonly logger = new Logger(CompanyVerificationReviewService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(StripeService) private readonly stripe: StripeService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // The name on the identity document of the person who holds a sole
  // trader's Profile, read from the provider that verified it when staff
  // ask, to match it against the documents. Never stored; each reading is
  // recorded. Null when there is no verified identity to read.
  async identityName(adminId: string, id: string) {
    const application = await this.prisma.companyVerification.findFirst({
      // Only while the application waits for a decision.
      where: { id, status: CompanyVerificationStatus.PENDING },
      select: {
        kind: true,
        profile: {
          select: { user: { select: { stripeIdentitySessionId: true } } },
        },
      },
    });
    if (!application) throw this.notFound();
    if (application.kind !== 'SOLE_TRADER') {
      throw AppException.BadRequest(
        ErrorCode.COMPANY_VERIFICATION_LOCKED,
        'Only a sole trader is matched against the identity',
      );
    }
    const sessionId = application.profile.user?.stripeIdentitySessionId;
    let name: { firstName: string; lastName: string } | null = null;
    if (sessionId) {
      const session = await this.stripe
        .getIdentityVerificationSession(sessionId)
        .catch((err: unknown) => {
          this.logger.error('Failed to read the identity session', err);
          return null;
        });
      const outputs =
        session?.status === 'verified' ? session.verified_outputs : null;
      if (outputs?.first_name || outputs?.last_name) {
        name = {
          firstName: outputs.first_name ?? '',
          lastName: outputs.last_name ?? '',
        };
      }
    }
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: AdminAction.COMPANY_IDENTITY_VIEWED,
        targetType: 'company_verification',
        targetId: id,
        details: name ? 'Identity name read' : 'No identity name to read',
      },
    });
    return { name };
  }

  // The applications waiting, oldest first.
  async queue() {
    const where = { status: CompanyVerificationStatus.PENDING };
    const [items, total] = await Promise.all([
      this.prisma.companyVerification.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        take: QUEUE_PAGE,
        select: STAFF_SELECT,
      }),
      this.prisma.companyVerification.count({ where }),
    ]);
    return { items, total };
  }

  async detail(id: string) {
    const application = await this.prisma.companyVerification.findUnique({
      where: { id },
      select: STAFF_SELECT,
    });
    if (!application) throw this.notFound();
    return application;
  }

  // A document, decrypted for the member of staff who opens it; the
  // opening is recorded.
  async document(adminId: string, id: string, documentId: string) {
    // Only while the application waits for a decision.
    const document = await this.prisma.companyVerificationDocument.findFirst({
      where: {
        id: documentId,
        verificationId: id,
        verification: { status: CompanyVerificationStatus.PENDING },
      },
      select: { fileName: true, contentType: true, content: true },
    });
    if (!document) throw this.notFound();
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: AdminAction.COMPANY_DOCUMENT_VIEWED,
        targetType: 'company_verification',
        targetId: id,
        details: `Document ${documentId}`,
      },
    });
    return {
      fileName: document.fileName,
      contentType: document.contentType,
      content: Buffer.from(this.crypto.decrypt(document.content), 'base64'),
    };
  }

  // Approves or rejects a waiting application. The documents are deleted
  // in the same step; an approval takes the place of an earlier one.
  async decide(adminId: string, id: string, dto: DecideCompanyDto) {
    const status = dto.approve
      ? CompanyVerificationStatus.APPROVED
      : CompanyVerificationStatus.REJECTED;
    const decided = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.companyVerification.updateMany({
        where: { id, status: CompanyVerificationStatus.PENDING },
        data: {
          status,
          decidedAt: new Date(),
          decidedById: adminId,
          rejectionReason: dto.approve ? null : (dto.reason ?? 'OTHER'),
          rejectionNote: dto.approve ? null : dto.note || null,
          emailCodeHash: null,
          emailCodeExpiresAt: null,
        },
      });
      if (count === 0) {
        throw AppException.Conflict(
          ErrorCode.COMPANY_VERIFICATION_LOCKED,
          'The application is not waiting for a decision',
        );
      }
      await tx.companyVerificationDocument.deleteMany({
        where: { verificationId: id },
      });
      const application = await tx.companyVerification.findUniqueOrThrow({
        where: { id },
        select: {
          profileId: true,
          rejectionReason: true,
          rejectionNote: true,
          profile: { select: { user: { select: { email: true } } } },
        },
      });
      if (dto.approve) {
        await tx.companyVerification.updateMany({
          where: {
            profileId: application.profileId,
            status: CompanyVerificationStatus.APPROVED,
            id: { not: id },
          },
          data: { status: CompanyVerificationStatus.REPLACED },
        });
      }
      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: dto.approve
            ? AdminAction.COMPANY_VERIFICATION_APPROVED
            : AdminAction.COMPANY_VERIFICATION_REJECTED,
          targetType: 'company_verification',
          targetId: id,
          details: dto.approve
            ? 'Approved'
            : `Rejected: ${application.rejectionReason}`,
        },
      });
      return application;
    });

    // Others see the mark change at once.
    await forgetProfileView(this.prisma, this.cache, decided.profileId);
    const notice: Notice = dto.approve
      ? { key: 'company_verified' }
      : {
          key: 'company_rejected',
          reason: decided.rejectionReason ?? 'OTHER',
          note: decided.rejectionNote,
        };
    this.events.emit('notification.create', {
      recipientId: decided.profileId,
      type: NotificationType.SYSTEM,
      notice,
      targetType: 'company_verification',
      targetId: id,
    } satisfies NotificationCreateEvent['payload']);
    // Telling by email is best effort: the decision already stands.
    // Where an email about a Profile goes: its own verified sign-in.
    const address = await emailForProfile(this.prisma, decided.profileId);
    if (address) {
      await this.email
        .sendCompanyVerificationDecided(address, notice)
        .catch((err: unknown) =>
          this.logger.error('Failed to send the company decision email', err),
        );
    }
    return this.detail(id);
  }

  private notFound() {
    return AppException.NotFound(
      ErrorCode.COMPANY_VERIFICATION_NOT_FOUND,
      'Not found',
    );
  }
}
