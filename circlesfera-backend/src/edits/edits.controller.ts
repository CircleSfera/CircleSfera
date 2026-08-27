import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateEditDto } from './dto/create-edit.dto.js';
import { GenerateCaptionsDto } from './dto/generate-captions.dto.js';
import { UpdateEditDto } from './dto/update-edit.dto.js';
import { EditsService } from './edits.service.js';

@Controller('edits')
@UseGuards(JwtAuthGuard)
export class EditsController {
  constructor(private readonly editsService: EditsService) {}

  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() createEditDto: CreateEditDto,
  ) {
    return this.editsService.create(user.profileId, createEditDto);
  }

  @Get()
  findAll(@CurrentUser() user: CurrentUserData) {
    return this.editsService.findAll(user.profileId);
  }

  @Post(':id/captions')
  @Throttle({ short: { limit: 3, ttl: 3600000 } })
  startCaptions(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: GenerateCaptionsDto,
  ) {
    return this.editsService.startCaptions(user.profileId, id, body.clipId);
  }

  @Get(':id/captions/:jobId')
  getCaptionsJob(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ) {
    return this.editsService.getCaptionsJob(user.profileId, id, jobId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.editsService.findOne(user.profileId, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() updateEditDto: UpdateEditDto,
  ) {
    return this.editsService.update(user.profileId, id, updateEditDto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.editsService.remove(user.profileId, id);
  }
}
