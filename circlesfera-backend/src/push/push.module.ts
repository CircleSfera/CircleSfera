import { Module } from '@nestjs/common';
import { FcmSender } from './fcm.sender.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [PushController],
  providers: [PushService, FcmSender],
  exports: [PushService],
})
export class PushModule {}
