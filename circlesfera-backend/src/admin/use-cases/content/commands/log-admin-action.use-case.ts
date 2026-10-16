import { Inject, Injectable } from '@nestjs/common';
import { AdminAction, type Prisma } from '@prisma/client';
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
    /** A transaction to write it in, with the change it records. */
    db: Pick<Prisma.TransactionClient, 'adminAuditLog'> = this.prisma,
  ) {
    await db.adminAuditLog.create({
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
