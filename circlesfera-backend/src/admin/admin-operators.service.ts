import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminAction, type AdminIdentityStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';

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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    mfaRequired: boolean;
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
      mfaRequired: admin.mfaRequired,
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
      password: string;
      displayName: string;
      roleIds: string[];
    },
  ) {
    const email = dto.email.toLowerCase().trim();
    if (dto.password.length < 12) {
      throw new BadRequestException('Password must be at least 12 characters');
    }
    this.validateRoleIds(dto.roleIds);

    const existing = await this.prisma.adminIdentity.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('An operator with this email already exists');
    }

    const linkedUser = await this.prisma.user.findUnique({ where: { email } });
    const passwordHash = await argon2.hash(dto.password);

    const created = await this.prisma.adminIdentity.create({
      data: {
        email,
        passwordHash,
        displayName: dto.displayName.trim() || email.split('@')[0],
        status: 'ACTIVE',
        mfaRequired: true,
        totpEnabled: false,
        linkedUserId: linkedUser?.id ?? null,
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
        mfaRequired: true,
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

    return this.serialize(updated);
  }

  async resetPassword(actorAdminId: string, id: string, password: string) {
    if (password.length < 12) {
      throw new BadRequestException('Password must be at least 12 characters');
    }
    const admin = await this.prisma.adminIdentity.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Operator not found');

    const passwordHash = await argon2.hash(password);
    const updated = await this.prisma.adminIdentity.update({
      where: { id },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      include: { roles: { include: { role: true } } },
    });

    await this.prisma.adminRefreshToken.deleteMany({ where: { adminId: id } });

    await this.logAction(
      actorAdminId,
      AdminAction.ADMIN_IDENTITY_CREATED,
      'admin',
      id,
      'Password reset by operator admin',
    );

    return this.serialize(updated);
  }
}
