import { forwardRef, Module } from '@nestjs/common';
import { StripeModule } from '../common/stripe/stripe.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SocketModule } from '../socket/socket.module.js';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';

@Module({
  imports: [PrismaModule, StripeModule, forwardRef(() => SocketModule)],
  controllers: [LiveController],
  providers: [LiveService],
  exports: [LiveService],
})
export class LiveModule {}
