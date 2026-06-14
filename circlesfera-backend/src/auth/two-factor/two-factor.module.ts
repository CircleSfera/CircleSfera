import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { TwoFactorController } from './two-factor.controller.js';
import { TwoFactorService } from './two-factor.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [TwoFactorController],
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
