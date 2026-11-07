import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { CreateStudioTemplateDto } from './dto/create-studio-template.dto.js';
import { UpdateStudioTemplateDto } from './dto/update-studio-template.dto.js';
import { StudioTemplatesService } from './studio-templates.service.js';

@Controller('studio-templates')
export class StudioTemplatesController {
  constructor(private readonly templates: StudioTemplatesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 30, ttl: 3600000 } })
  @ApiResponse({ status: 201 })
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateStudioTemplateDto,
  ) {
    return this.templates.create(user.profileId, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  mine(@CurrentUser() user: CurrentUserData) {
    return this.templates.mine(user.profileId);
  }

  /** The template offered from a Frame, for whoever can see the Frame. */
  @Get('of-post/:postId')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  forPost(
    @CurrentUser() user: CurrentUserData | null,
    @Param('postId', new ParseUUIDPipe()) postId: string,
  ) {
    return this.templates.forPost(postId, user?.profileId);
  }

  @Post(':id/uses')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiResponse({ status: 200 })
  use(
    @CurrentUser() user: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.templates.use(user.profileId, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStudioTemplateDto,
  ) {
    return this.templates.update(user.profileId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiResponse({ status: 204 })
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.templates.remove(user.profileId, id);
  }
}
