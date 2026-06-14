import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
// biome-ignore lint/style/useImportType: required for NestJS DI
import { WebrtcService } from './webrtc.service.js';

@Controller('webrtc')
@UseGuards(JwtAuthGuard)
export class WebrtcController {
  constructor(private readonly webrtcService: WebrtcService) {}

  @Get('ice-servers')
  async getIceServers() {
    return this.webrtcService.getIceServers();
  }
}
