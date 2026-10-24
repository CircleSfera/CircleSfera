import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { WebrtcService } from './webrtc.service.js';

@Controller('webrtc')
@UseGuards(JwtAuthGuard)
export class WebrtcController {
  constructor(private readonly webrtcService: WebrtcService) {}

  @Get('ice-servers')
  @ApiResponse({ status: 200, type: Object })
  async getIceServers() {
    return this.webrtcService.getIceServers();
  }
}
