import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { CreateHighlightDto } from './dto/create-highlight.dto.js';
import { UpdateHighlightDto } from './dto/update-highlight.dto.js';
import { HighlightsService } from './highlights.service.js';

// REST controller for story highlights. Create/delete require authentication.
@Controller('highlights')
export class HighlightsController {
  constructor(
    @Inject(HighlightsService)
    private readonly highlightsService: HighlightsService,
  ) {}

  // Create a new highlight from selected stories (requires auth).
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiResponse({ status: 201, type: Object })
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() createHighlightDto: CreateHighlightDto,
  ) {
    return this.highlightsService.create(user.profileId, createHighlightDto);
  }

  // Update a highlight (requires auth).
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiResponse({ status: 200, type: Object })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() updateHighlightDto: UpdateHighlightDto,
  ) {
    return this.highlightsService.update(
      id,
      user.profileId,
      updateHighlightDto,
    );
  }

  // List all highlights for a specific profile.
  @Get('profile/:profileId')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  findAll(
    @Param('profileId') profileId: string,
    @CurrentUser() user: CurrentUserData | null,
  ) {
    return this.highlightsService.findAll(profileId, user?.profileId);
  }

  // Deprecated: Use GET highlights/profile/:profileId
  @Get('user/:profileId')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  findAllLegacy(
    @Param('profileId') profileId: string,
    @CurrentUser() user: CurrentUserData | null,
  ) {
    return this.highlightsService.findAll(profileId, user?.profileId);
  }

  // Get a single highlight by ID.
  @Get(':id')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData | null,
  ) {
    return this.highlightsService.findOne(id, user?.profileId);
  }

  // Delete a highlight (requires auth).
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiResponse({ status: 200 })
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.highlightsService.remove(id, user.profileId);
  }
}
