import { ErrorCode } from '@circlesfera/shared';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// The core creator tools (dashboard summary, content lists, promotions) are
// available to any Creator or Business Profile and never depend on a paid
// platform plan. What a plan adds on top, such as the advanced analytics,
// has its own guard.
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

    // Explicit allowlist (fail-closed): an unresolved Profile or an unknown
    // account type is refused.
    const accountType = profile?.accountType;
    if (accountType !== 'CREATOR' && accountType !== 'BUSINESS') {
      throw AppException.Forbidden(
        ErrorCode.CREATOR_ACCOUNT_REQUIRED,
        'Creator tools are available to Creator and Business accounts.',
      );
    }
    return true;
  }
}
