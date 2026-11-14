import { ErrorCode, type NotificationCreateEvent } from '@circlesfera/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AdminAction,
  CompanyVerificationStatus,
  NotificationType,
  type Prisma,
} from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { CryptoService } from '../common/services/crypto.service.js';
import { EmailService } from '../email/email.service.js';
import type { Notice } from '../notifications/notice-copy.js';
import { PrismaService } from '../prisma/prisma.service.js';
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
      user: {
        // The identity check, so staff can match a sole trader's name in
        // the provider that verified it.
        select: { identityVerifiedAt: true, stripeIdentitySessionId: true },
      },
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
  ) {}

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
    const document = await this.prisma.companyVerificationDocument.findFirst({
      where: { id: documentId, verificationId: id },
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
    const address = decided.profile.user?.email;
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
