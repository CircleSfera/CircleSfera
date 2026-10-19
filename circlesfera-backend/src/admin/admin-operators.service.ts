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
import { PrismaService } from '../prisma/prisma.service.js';
import { UNUSED_STAFF_PASSWORD_HASH } from './staff-password.constants.js';

const KNOWN_ROLE_IDS = new Set([
  'arole_super',
  'arole_platform',
  'arole_moderation',
  'arole_support',
  'arole_finance',
  'arole_content',
  'arole_security',
  'arole_analytics',
]);

@Injectable()
export class AdminOperatorsService {
  private readonly logger = new Logger(AdminOperatorsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EnrolmentProofService)
    private readonly enrolmentProof: EnrolmentProofService,
  ) {}

  // Sends the link that lets the identity enrol its authenticator. A failure
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

  // An identity that already has its authenticator has nothing to enrol.
  private async awaitingEnrolment(id: string) {
    const admin = await this.prisma.adminIdentity.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Operator not found');
    if (admin.totpEnabled) {
      throw new ConflictException('This operator already has an authenticator');
    }
    if (admin.status !== 'ACTIVE') {
      throw new ConflictException('This operator is not active');
    }
    return admin;
  }

  // Sends a new enrolment link; the previous link or code stops working.
  async sendEnrolmentLinkAgain(actorAdminId: string, id: string) {
    const admin = await this.awaitingEnrolment(id);
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
    },
  ) {
    const email = dto.email.toLowerCase().trim();
    this.validateRoleIds(dto.roleIds);

    const existing = await this.prisma.adminIdentity.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('An operator with this email already exists');
    }

    // A staff member signs in with the password of their CircleSfera account,
    // so the account has to exist: the one whose sign-in has this email.
    const signIn = await this.prisma.signIn.findUnique({
      where: { email },
      select: { userId: true },
    });
    if (!signIn) {
      throw new BadRequestException(
        'No CircleSfera account has this email: the person has to sign up first',
      );
    }

    const created = await this.prisma.adminIdentity.create({
      data: {
        email,
        passwordHash: UNUSED_STAFF_PASSWORD_HASH,
        displayName: dto.displayName.trim() || email.split('@')[0],
        status: 'ACTIVE',
        totpEnabled: false,
        linkedUserId: signIn.userId,
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
      `Created operator ${email}`,
    );
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
    const admin = await this.prisma.adminIdentity.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Operator not found');

    await this.prisma.$transaction([
      this.prisma.adminIdentityRole.deleteMany({ where: { adminId: id } }),
      this.prisma.adminIdentityRole.createMany({
        data: roleIds.map((roleId) => ({ adminId: id, roleId })),
      }),
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
      },
      include: { roles: { include: { role: true } } },
    });

    await this.prisma.adminRefreshToken.deleteMany({ where: { adminId: id } });

    await this.logAction(
      actorAdminId,
      AdminAction.ADMIN_MFA_ENABLED,
      'admin',
      id,
      'MFA reset — re-enrollment required',
    );
    // Enrolling again needs a new proof: the link goes to the staff email.
    await this.sendEnrolmentLink(actorAdminId, updated);

    return this.serialize(updated);
  }

  // Clears a lockout after too many failed sign-ins. The password is not
  // touched: it is the one of the person's CircleSfera account.
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
