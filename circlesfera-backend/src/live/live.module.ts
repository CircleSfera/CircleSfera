import { forwardRef, Module } from '@nestjs/common';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SocketModule } from '../socket/socket.module.js';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';

@Module({
  imports: [PrismaModule, forwardRef(() => SocketModule)],
  controllers: [LiveController],
  providers: [LiveService, StripeService],
  exports: [LiveService],
})
export class LiveModule {}
