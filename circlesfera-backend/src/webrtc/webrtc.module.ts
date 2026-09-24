// This module provides ICE server config (WebrtcService/WebrtcController)
// and call authorization/state (WebrtcSignalingService) — not the signaling
// transport itself, which lives in AppGateway (src/socket/). See ADR-0012
// "Module boundary" for the full split.
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
