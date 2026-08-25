import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailVerifiedGuard } from '../../auth/guards/email-verified.guard.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SystemSettingsModule } from '../../system-settings/system-settings.module.js';
import { AbuseHashService } from './abuse-hash.service.js';
import { DeviceSignalService } from './device-signal.service.js';
import { TurnstileService } from './turnstile.service.js';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, SystemSettingsModule],
  providers: [
    AbuseHashService,
    DeviceSignalService,
    TurnstileService,
    EmailVerifiedGuard,
  ],
  exports: [
    AbuseHashService,
    DeviceSignalService,
    TurnstileService,
    EmailVerifiedGuard,
  ],
})
export class AbuseModule {}
