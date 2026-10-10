import { ErrorCode } from '@circlesfera/shared';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// What the Elite Creator and Business plans add to the creator tools, for
// example the advanced analytics. The plan is read from the Profile that
// makes the request. The core creator tools never use this guard: they
// follow the kind of account alone.
@Injectable()
export class ElitePlanGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const profileId: string | undefined = context.switchToHttp().getRequest()
      .user?.profileId;

    const profile = profileId
      ? await this.prisma.profile.findUnique({
          where: { id: profileId },
          select: { verificationLevel: true },
        })
      : null;

    if (
      profile?.verificationLevel !== 'ELITE' &&
      profile?.verificationLevel !== 'BUSINESS'
    ) {
      // The code lets the app offer the plan instead of a bare refusal.
      throw AppException.Forbidden(
        ErrorCode.PLAN_REQUIRED,
        'This is part of the Elite Creator and Business plans.',
      );
    }
    return true;
  }
}
