import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminJwtStrategy } from '../auth/strategies/admin-jwt.strategy.js';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { EnrolmentProofService } from './enrolment-proof.service.js';

@Module({
  imports: [PrismaModule, EmailModule, PassportModule, JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtStrategy, EnrolmentProofService],
  exports: [AdminAuthService, AdminJwtStrategy, EnrolmentProofService],
})
export class AdminAuthModule {}
