import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth.module.js';
import { PasskeyController } from './passkey.controller.js';
import { PasskeyService } from './passkey.service.js';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [PasskeyController],
  providers: [PasskeyService],
  exports: [PasskeyService],
})
export class PasskeyModule {}
