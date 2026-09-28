import { ErrorCode } from '@circlesfera/shared';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { canMonetize } from '../../common/constants/monetization.constants.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// Creator tools (dashboard, analytics, promotions) are available to any
// Creator or Business Profile. They never depend on a paid platform plan:
// plans sell verification and status, not tools.
@Injectable()
export class CreatorAccountGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const profileId: string | undefined = context.switchToHttp().getRequest()
      .user?.profileId;

    const profile = profileId
      ? await this.prisma.profile.findUnique({
          where: { id: profileId },
          select: { accountType: true },
        })
      : null;

    if (!canMonetize(profile?.accountType)) {
      throw AppException.Forbidden(
        ErrorCode.ACCOUNT_TYPE_NOT_ELIGIBLE_FOR_MONETIZATION,
        'Creator tools are available to Creator and Business accounts.',
      );
    }
    return true;
  }
}
