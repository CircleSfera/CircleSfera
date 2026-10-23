import { Module } from '@nestjs/common';
import { ApnsSender } from './apns.sender.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [PushController],
  providers: [PushService, ApnsSender],
  exports: [PushService],
})
export class PushModule {}
