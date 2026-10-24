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
  UseGuards,
} from '@nestjs/common';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AdminAction } from '@prisma/client';
import { AudioService } from '../audio/audio.service.js';
import { CreateAudioDto } from '../audio/dto/create-audio.dto.js';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminService } from './admin.service.js';

@Controller('admin')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminMediaController {
  constructor(
    @Inject(AudioService) private readonly audioService: AudioService,
    @Inject(AdminService) private readonly adminService: AdminService,
  ) {}

  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @RequireStaffPermissions('content')
  @Get('audio')
  @ApiResponse({ status: 200 })
  async getAudio(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    return this.audioService.findAllPaginated(+page, +limit, search);
  }

  @RequireStaffPermissions('content')
  @Post('audio')
  @ApiResponse({ status: 201 })
  async createAudio(
    @Body() dto: CreateAudioDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    const result = await this.audioService.create(dto);
    await this.adminService.logAction(
      admin.adminId,
      AdminAction.CREATE_AUDIO,
      'audio',
      result.id,
      `Track: ${dto.title} by ${dto.artist}`,
    );
    return result;
  }

  @RequireStaffPermissions('content')
  @Patch('audio/:id')
  @ApiResponse({ status: 200 })
  async updateAudio(
    @Param('id') id: string,
    @Body() dto: CreateAudioDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    const result = await this.audioService.update(id, dto);
    await this.adminService.logAction(
      admin.adminId,
      AdminAction.UPDATE_AUDIO,
      'audio',
      id,
      `Updated track: ${dto.title}`,
    );
    return result;
  }

  @RequireStaffPermissions('content')
  @Delete('audio/:id')
  @ApiResponse({ status: 200 })
  async deleteAudio(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    const result = await this.audioService.delete(id);
    await this.adminService.logAction(
      admin.adminId,
      AdminAction.DELETE_AUDIO,
      'audio',
      id,
    );
    return result;
  }
}
