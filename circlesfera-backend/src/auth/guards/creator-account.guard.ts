import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

interface RequestWithUser {
  user?: {
    profileId?: string;
  };
}

@Injectable()
export class CreatorAccountGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const profileId = request.user?.profileId;

    if (!profileId) {
      throw new ForbiddenException(
        'A profile is required for creator capabilities',
      );
    }

    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { accountType: true },
    });

    if (!profile) {
      throw new ForbiddenException('Profile not found');
    }

    if (profile.accountType === AccountType.PERSONAL) {
      throw new ForbiddenException(
        'Creator capabilities require a Creator or Business profile',
      );
    }

    return true;
  }
}
