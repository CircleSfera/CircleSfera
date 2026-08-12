import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import type { Request } from 'express';
import { AudioService } from '../audio/audio.service.js';
import { CreateAudioDto } from '../audio/dto/create-audio.dto.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminService } from './admin.service.js';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('admin')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminMediaController {
  constructor(
    @Inject(AudioService) private readonly audioService: AudioService,
    @Inject(AdminService) private readonly adminService: AdminService,
  ) {}

  @RequireStaffPermissions('content')
  @Get('audio')
  async getAudio(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    return this.audioService.findAllPaginated(+page, +limit, search);
  }

  @RequireStaffPermissions('content')
  @Post('audio')
  async createAudio(@Body() dto: CreateAudioDto, @Req() req: AuthRequest) {
    const result = await this.audioService.create(dto);
    await this.adminService.logAction(
      req.user.userId,
      AdminAction.CREATE_AUDIO,
      'audio',
      result.id,
      `Track: ${dto.title} by ${dto.artist}`,
    );
    return result;
  }

  @RequireStaffPermissions('content')
  @Patch('audio/:id')
  async updateAudio(
    @Param('id') id: string,
    @Body() dto: CreateAudioDto,
    @Req() req: AuthRequest,
  ) {
    const result = await this.audioService.update(id, dto);
    await this.adminService.logAction(
      req.user.userId,
      AdminAction.UPDATE_AUDIO,
      'audio',
      id,
      `Updated track: ${dto.title}`,
    );
    return result;
  }

  @RequireStaffPermissions('content')
  @Delete('audio/:id')
  async deleteAudio(@Param('id') id: string, @Req() req: AuthRequest) {
    const result = await this.audioService.delete(id);
    await this.adminService.logAction(
      req.user.userId,
      AdminAction.DELETE_AUDIO,
      'audio',
      id,
    );
    return result;
  }
}
