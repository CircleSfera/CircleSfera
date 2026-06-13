import { Module } from '@nestjs/common';
import { WebrtcController } from './webrtc.controller.js';
import { WebrtcService } from './webrtc.service.js';

@Module({
  providers: [WebrtcService],
  controllers: [WebrtcController]
})
export class WebrtcModule {}
