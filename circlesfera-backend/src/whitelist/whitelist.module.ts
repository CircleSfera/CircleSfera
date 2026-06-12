import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WhitelistController } from './whitelist.controller.js';
import { WhitelistService } from './whitelist.service.js';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [WhitelistController],
  providers: [WhitelistService],
  exports: [WhitelistService],
})
export class WhitelistModule {}
