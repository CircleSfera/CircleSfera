import { ApiErrorCode } from '@circlesfera/shared';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TurnstileService } from '../../common/abuse/turnstile.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from '../../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../../system-settings/system-settings.service.js';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
    private readonly turnstile: TurnstileService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.EMAIL_VERIFICATION_REQUIRED,
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId?: string } | undefined;
    if (!user?.userId) {
      throw new ForbiddenException(ApiErrorCode.EMAIL_NOT_VERIFIED);
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { emailVerified: true },
    });

    if (dbUser?.emailVerified) return true;

    await this.turnstile.incrementEmailForbidden();
    throw new ForbiddenException({
      message: ApiErrorCode.EMAIL_NOT_VERIFIED,
    });
  }
}
