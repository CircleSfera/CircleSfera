import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasskeyModule } from './passkey/passkey.module.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { TwoFactorModule } from './two-factor/two-factor.module.js';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}),
    EmailModule,
    forwardRef(() => PasskeyModule),
    TwoFactorModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
