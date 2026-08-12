import { Inject, Injectable } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';

export type AdminAuditMeta = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

@Injectable()
export class LogAdminActionUseCase {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(
    adminId: string,
    action: AdminAction,
    targetType: string,
    targetId: string,
    details?: string,
    meta?: AdminAuditMeta,
  ) {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        details,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        requestId: meta?.requestId,
      },
    });
  }
}
