import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdminAction, type AdminIdentityStatus } from '@prisma/client';
import { EnrolmentProofService } from '../admin-auth/enrolment-proof.service.js';
import {
  EXTERNAL_REVIEWER_ROLE_ID,
  REVIEWER_ACCESS_MAX_DAYS,
  reviewerAccessEnd,
  reviewerAccessLatestEnd,
} from '../admin-auth/external-reviewer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  hasOwnStaffPassword,
  UNUSED_STAFF_PASSWORD_HASH,
} from './staff-password.constants.js';

const KNOWN_ROLE_IDS = new Set([
  'arole_super',
  'arole_platform',
  'arole_moderation',
  'arole_support',
  'arole_finance',
  'arole_content',
  'arole_security',
  'arole_analytics',
  EXTERNAL_REVIEWER_ROLE_ID,
]);

// Whether an identity has had access before: it set its own password or has
// signed in. Its access is then recovered only with a code an administrator
// hands over, never with a link to its email: a mailbox alone never opens
// the staff sites of someone who already used them.
function hadAccess(admin: {
  passwordSetAt?: Date | null;
  lastLoginAt?: Date | null;
}): boolean {
  return !!admin.passwordSetAt || !!admin.lastLoginAt;
}

// Whether a set of roles makes an external reviewer: that role alone.
function isReviewerRoleSet(roleIds: readonly string[]): boolean {
  return roleIds.length === 1 && roleIds[0] === EXTERNAL_REVIEWER_ROLE_ID;
}

@Injectable()
export class AdminOperatorsService {
  private readonly logger = new Logger(AdminOperatorsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EnrolmentProofService)
    private readonly enrolmentProof: EnrolmentProofService,
  ) {}

  // Sends the link that lets the identity set up its access: a password of
  // its own, and for a member of staff an authenticator. A failure
  // to send never undoes what was done: the link can be sent again.
  private async sendEnrolmentLink(
    actorAdminId: string,
    admin: { id: string; email: string },
  ) {
    try {
      await this.enrolmentProof.sendLink(admin);
      await this.logAction(
        actorAdminId,
        AdminAction.ADMIN_ENROLMENT_ISSUED,
        'admin',
        admin.id,
        'Enrolment link sent to the staff email',
      );
    } catch (error) {
      this.logger.error(
        `The enrolment link of operator ${admin.id} could not be sent: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  // An identity a proof may be issued for: a member of staff with no
  // authenticator yet (its access reset, or never set up), or any external
  // reviewer, who has no authenticator to reset and recovers a forgotten
  // password with a proof. Whether it may go by email is decided apart.
  private async awaitingEnrolment(id: string) {
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id },
      include: { roles: { select: { roleId: true } } },
    });
    if (!admin) throw new NotFoundException('Operator not found');
    if (
      !isReviewerRoleSet(admin.roles.map((r) => r.roleId)) &&
      admin.totpEnabled
    ) {
      throw new ConflictException('This operator already has an authenticator');
    }
    if (admin.status !== 'ACTIVE') {
      throw new ConflictException('This operator is not active');
    }
    return admin;
  }

  // Sends a new enrolment link; the previous link or code stops working.
  // Only to an identity that never had access: one that had is given a code.
  async sendEnrolmentLinkAgain(actorAdminId: string, id: string) {
    const admin = await this.awaitingEnrolment(id);
    if (hadAccess(admin)) {
      throw new ConflictException(
        'This operator has had access before: give them a code in person',
      );
    }
    await this.enrolmentProof.sendLink(admin);
    await this.logAction(
      actorAdminId,
      AdminAction.ADMIN_ENROLMENT_ISSUED,
      'admin',
      id,
      'Enrolment link sent to the staff email',
    );
    return { sent: true };
  }

  // A code to hand over in person, shown only in this answer; the previous
  // link or code stops working.
  async issueEnrolmentCode(actorAdminId: string, id: string) {
    await this.awaitingEnrolment(id);
    const code = await this.enrolmentProof.issueCode(id);
    await this.logAction(
      actorAdminId,
      AdminAction.ADMIN_ENROLMENT_ISSUED,
      'admin',
      id,
      'Enrolment code issued by an administrator',
    );
    return { code, expiresInHours: 24 };
  }

  private async logAction(
    adminId: string,
    action: AdminAction,
    targetType: string,
    targetId: string,
    details?: string,
  ) {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        details,
      },
    });
  }

  private serialize(admin: {
    id: string;
    email: string;
    displayName: string;
    status: AdminIdentityStatus;
    totpEnabled: boolean;
    lastLoginAt: Date | null;
    lastActivityAt: Date | null;
    linkedUserId: string | null;
    passwordSetAt?: Date | null;
    accessExpiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    roles: Array<{
      role: { id: string; name: string; description: string | null };
    }>;
  }) {
    return {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      status: admin.status,
      totpEnabled: admin.totpEnabled,
      lastLoginAt: admin.lastLoginAt,
      lastActivityAt: admin.lastActivityAt,
      linkedUserId: admin.linkedUserId,
      // Whether the identity has set a password of its own; one that has not
      // still signs in the old way, with its linked account's password.
      ownPassword: hasOwnStaffPassword(admin),
      accessExpiresAt: admin.accessExpiresAt,
      externalReviewer: isReviewerRoleSet(admin.roles.map((r) => r.role.id)),
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      roles: admin.roles.map((r) => ({
        id: r.role.id,
        name: r.role.name,
        description: r.role.description,
      })),
    };
  }

  private validateRoleIds(roleIds: string[]) {
    if (!roleIds.length) {
      throw new BadRequestException('At least one role is required');
    }
    for (const id of roleIds) {
      if (!KNOWN_ROLE_IDS.has(id)) {
        throw new BadRequestException(`Unknown role id: ${id}`);
      }
    }
    // The reviewer role is never held with another: whoever holds it reads
    // the review area and nothing else.
    if (roleIds.includes(EXTERNAL_REVIEWER_ROLE_ID) && roleIds.length > 1) {
      throw new BadRequestException(
        'The external reviewer role cannot be combined with another role',
      );
    }
  }

  // The end of an identity's access asked for: a date in the future, and for
  // an external reviewer, always one, at most the longest a reviewer is
  // given at once (30 days from now when none is asked for).
  private accessEndFor(
    reviewer: boolean,
    asked: string | null | undefined,
  ): Date | null {
    if (asked === null || asked === undefined) {
      return reviewer ? reviewerAccessEnd() : null;
    }
    const end = new Date(asked);
    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
      throw new BadRequestException('The access end must be in the future');
    }
    if (reviewer && end > reviewerAccessLatestEnd()) {
      throw new BadRequestException(
        `An external reviewer is given access for at most ${REVIEWER_ACCESS_MAX_DAYS} days at once`,
      );
    }
    return end;
  }

  async listRoles() {
    return this.prisma.adminRole.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true },
    });
  }

  async listOperators(page = 1, limit = 20, search?: string, status?: string) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = {
      ...(status === 'ACTIVE' || status === 'DISABLED'
        ? { status: status as AdminIdentityStatus }
        : {}),
      ...(search?.trim()
        ? {
            OR: [
              {
                email: {
                  contains: search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                displayName: {
                  contains: search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.adminIdentity.count({ where }),
      this.prisma.adminIdentity.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          roles: { include: { role: true } },
        },
      }),
    ]);

    return {
      data: rows.map((r) => this.serialize(r)),
      meta: {
        total,
        page: Math.max(page, 1),
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  async getOperator(id: string) {
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!admin) throw new NotFoundException('Operator not found');
    return this.serialize(admin);
  }

  async createOperator(
    actorAdminId: string,
    dto: {
      email: string;
      displayName: string;
      roleIds: string[];
      accessExpiresAt?: string;
    },
  ) {
    const email = dto.email.toLowerCase().trim();
    this.validateRoleIds(dto.roleIds);
    const reviewer = isReviewerRoleSet(dto.roleIds);
    const accessExpiresAt = this.accessEndFor(reviewer, dto.accessExpiresAt);

    const existing = await this.prisma.adminIdentity.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('An operator with this email already exists');
    }

    // No CircleSfera account is needed, nor linked: the person sets a
    // password of their own from the link sent to this email.
    const created = await this.prisma.adminIdentity.create({
      data: {
        email,
        passwordHash: UNUSED_STAFF_PASSWORD_HASH,
        displayName: dto.displayName.trim() || email.split('@')[0],
        status: 'ACTIVE',
        totpEnabled: false,
        accessExpiresAt,
        roles: {
          create: dto.roleIds.map((roleId) => ({ roleId })),
        },
      },
      include: { roles: { include: { role: true } } },
    });

    await this.logAction(
      actorAdminId,
      AdminAction.ADMIN_IDENTITY_CREATED,
      'admin',
      created.id,
      reviewer
        ? `Created external reviewer ${email} until ${accessExpiresAt?.toISOString()}`
        : `Created operator ${email}`,
    );
    // Everyone sets up their access from the link: a password, and for a
    // member of staff an authenticator too.
    await this.sendEnrolmentLink(actorAdminId, created);

    return this.serialize(created);
  }

  async updateStatus(
    actorAdminId: string,
    id: string,
    status: AdminIdentityStatus,
  ) {
    if (actorAdminId === id && status === 'DISABLED') {
      throw new ForbiddenException('Cannot disable your own operator account');
    }
    const admin = await this.prisma.adminIdentity.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Operator not found');

    const updated = await this.prisma.adminIdentity.update({
      where: { id },
      data: {
        status,
        ...(status === 'DISABLED'
          ? { lockedUntil: null, failedLoginCount: 0 }
          : {}),
      },
      include: { roles: { include: { role: true } } },
    });

    if (status === 'DISABLED') {
      await this.prisma.adminRefreshToken.deleteMany({
        where: { adminId: id },
      });
    }

    await this.logAction(
      actorAdminId,
      status === 'DISABLED'
        ? AdminAction.ADMIN_IDENTITY_DISABLED
        : AdminAction.ADMIN_IDENTITY_CREATED,
      'admin',
      id,
      `Status set to ${status}`,
    );

    return this.serialize(updated);
  }

  async replaceRoles(actorAdminId: string, id: string, roleIds: string[]) {
    this.validateRoleIds(roleIds);
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id },
      include: { roles: { select: { roleId: true } } },
    });
    if (!admin) throw new NotFoundException('Operator not found');

    const wasReviewer = isReviewerRoleSet(admin.roles.map((r) => r.roleId));
    const reviewer = isReviewerRoleSet(roleIds);
    // Becoming a reviewer gives the access a new end if it has none, one
    // already past, or a later one than a reviewer may have.
    const keepsEnd =
      admin.accessExpiresAt !== null &&
      admin.accessExpiresAt.getTime() > Date.now() &&
      admin.accessExpiresAt <= reviewerAccessLatestEnd();
    const accessExpiresAt =
      reviewer && !keepsEnd ? reviewerAccessEnd() : admin.accessExpiresAt;

    await this.prisma.$transaction([
      this.prisma.adminIdentityRole.deleteMany({ where: { adminId: id } }),
      this.prisma.adminIdentityRole.createMany({
        data: roleIds.map((roleId) => ({ adminId: id, roleId })),
      }),
      this.prisma.adminIdentity.update({
        where: { id },
        data: { accessExpiresAt },
      }),
      // Becoming a reviewer, or ceasing to be one, changes how the identity
      // signs in: its sessions end.
      ...(wasReviewer === reviewer
        ? []
        : [
            this.prisma.adminRefreshToken.deleteMany({
              where: { adminId: id },
            }),
          ]),
    ]);

    const updated = await this.prisma.adminIdentity.findUniqueOrThrow({
      where: { id },
      include: { roles: { include: { role: true } } },
    });

    await this.logAction(
      actorAdminId,
      AdminAction.ROLE_ASSIGNED,
      'admin',
      id,
      `Roles: ${roleIds.join(',')}`,
    );
    // No longer a reviewer: a member of staff enrols an authenticator, from
    // a link only if it never had access (otherwise from a code).
    if (
      wasReviewer &&
      !reviewer &&
      !updated.totpEnabled &&
      !hadAccess(updated)
    ) {
      await this.sendEnrolmentLink(actorAdminId, updated);
    }

    return this.serialize(updated);
  }

  // Sets when an identity stops working, or that it does not (never for an
  // external reviewer). A reviewer's access is extended by this.
  async setAccessExpiry(
    actorAdminId: string,
    id: string,
    asked: string | null,
  ) {
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id },
      include: { roles: { select: { roleId: true } } },
    });
    if (!admin) throw new NotFoundException('Operator not found');
    if (actorAdminId === id) {
      throw new ForbiddenException('Cannot change your own access end');
    }
    const reviewer = isReviewerRoleSet(admin.roles.map((r) => r.roleId));
    if (reviewer && asked === null) {
      throw new BadRequestException('An external reviewer always has an end');
    }
    const accessExpiresAt = this.accessEndFor(reviewer, asked);

    const updated = await this.prisma.adminIdentity.update({
      where: { id },
      data: { accessExpiresAt },
      include: { roles: { include: { role: true } } },
    });
    await this.logAction(
      actorAdminId,
      AdminAction.ADMIN_ACCESS_EXPIRY_SET,
      'admin',
      id,
      accessExpiresAt
        ? `Access ends ${accessExpiresAt.toISOString()}`
        : 'Access has no end',
    );
    return this.serialize(updated);
  }

  async resetMfa(actorAdminId: string, id: string) {
    const admin = await this.prisma.adminIdentity.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Operator not found');

    const updated = await this.prisma.adminIdentity.update({
      where: { id },
      data: {
        totpSecret: null,
        totpEnabled: false,
        enrolmentProofHash: null,
        enrolmentProofExpiresAt: null,
        enrolmentProofPasswordMark: null,
      },
      include: { roles: { include: { role: true } } },
    });

    await this.prisma.adminRefreshToken.deleteMany({ where: { adminId: id } });
    // Resetting the access removes every passkey too: one added by whoever
    // took the access must not outlive its recovery.
    await this.prisma.adminPasskey.deleteMany({ where: { adminId: id } });

    await this.logAction(
      actorAdminId,
      AdminAction.ADMIN_MFA_ENABLED,
      'admin',
      id,
      'MFA reset — re-enrollment required',
    );
    // Enrolling again needs a new proof. An identity that had access gets it
    // from a code an administrator hands over; one that never had, by link.
    if (!hadAccess(updated)) {
      await this.sendEnrolmentLink(actorAdminId, updated);
    }

    return this.serialize(updated);
  }

  // Clears a lockout after too many failed sign-ins. The password is not
  // touched: a forgotten one is replaced from a new access link.
  async unlock(actorAdminId: string, id: string) {
    const admin = await this.prisma.adminIdentity.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Operator not found');

    const updated = await this.prisma.adminIdentity.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
      include: { roles: { include: { role: true } } },
    });

    await this.logAction(
      actorAdminId,
      AdminAction.MANUAL_OVERRIDE,
      'admin',
      id,
      'Lockout cleared by operator admin',
    );

    return this.serialize(updated);
  }
}
