import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WebrtcController } from './webrtc.controller.js';
import { WebrtcService } from './webrtc.service.js';
import { WebrtcSignalingService } from './webrtc-signaling.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [WebrtcController],
  providers: [WebrtcService, WebrtcSignalingService],
  exports: [WebrtcService, WebrtcSignalingService],
})
export class WebrtcModule {}
