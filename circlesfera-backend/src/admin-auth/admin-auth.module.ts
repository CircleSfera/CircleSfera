import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminJwtStrategy } from '../auth/strategies/admin-jwt.strategy.js';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { EnrolmentProofService } from './enrolment-proof.service.js';
import { StaffPasskeyController } from './staff-passkey.controller.js';
import { StaffPasskeyService } from './staff-passkey.service.js';

@Module({
  imports: [PrismaModule, EmailModule, PassportModule, JwtModule.register({})],
  controllers: [AdminAuthController, StaffPasskeyController],
  providers: [
    AdminAuthService,
    AdminJwtStrategy,
    EnrolmentProofService,
    StaffPasskeyService,
  ],
  exports: [AdminAuthService, AdminJwtStrategy, EnrolmentProofService],
})
export class AdminAuthModule {}
