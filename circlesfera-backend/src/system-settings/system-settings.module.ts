import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MaintenanceModeGuard } from './maintenance-mode.guard.js';
import { SystemSettingsService } from './system-settings.service.js';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    SystemSettingsService,
    {
      provide: APP_GUARD,
      useClass: MaintenanceModeGuard,
    },
  ],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
