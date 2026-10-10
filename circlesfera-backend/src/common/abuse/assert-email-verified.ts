import { ErrorCode } from '@circlesfera/shared';
import { ForbiddenException } from '@nestjs/common';
import { TurnstileService } from '../../common/abuse/turnstile.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from '../../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../../system-settings/system-settings.service.js';
import { sessionEmailVerified } from '../auth/sign-in-lookup.js';
import { AppException } from '../errors/app.exception.js';

export async function assertEmailVerifiedForWrite(
  prisma: PrismaService,
  systemSettings: SystemSettingsService,
  turnstile: TurnstileService,
  userId: string,
): Promise<void> {
  const required = await systemSettings.isEnabled(
    SYSTEM_SETTING_KEYS.EMAIL_VERIFICATION_REQUIRED,
  );
  if (!required) return;

  if (await sessionEmailVerified(prisma, { userId })) return;

  await turnstile.incrementEmailForbidden();
  throw AppException.Forbidden(
    ErrorCode.EMAIL_NOT_VERIFIED,
    'Verify your email to do this.',
  );
}

// Kept so callers that catch Nest ForbiddenException still work.
export function emailNotVerifiedForbidden(): ForbiddenException {
  return new ForbiddenException({ message: 'EMAIL_NOT_VERIFIED' });
}
