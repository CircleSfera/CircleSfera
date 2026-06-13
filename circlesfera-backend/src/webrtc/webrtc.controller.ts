import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { WebrtcService } from './webrtc.service.js';

@Controller('webrtc')
@UseGuards(JwtAuthGuard)
export class WebrtcController {
  constructor(private readonly webrtcService: WebrtcService) {}

  @Get('ice-servers')
  async getIceServers() {
    return this.webrtcService.getIceServers();
  }
}
