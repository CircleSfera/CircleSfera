import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { MediaController } from './media.controller.js';
import { MediaAuthService } from './media-auth.service.js';
import { MediaStaffViewerService } from './media-staff-viewer.service.js';

@Module({
  imports: [
    PrismaModule,
    UploadsModule,
    AdminAuthModule,
    JwtModule.register({}),
  ],
  controllers: [MediaController],
  providers: [MediaAuthService, MediaStaffViewerService],
})
export class MediaModule {}
