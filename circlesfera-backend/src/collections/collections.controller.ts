import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CollectionsService } from './collections.service.js';
import {
  CreateCollectionDto,
  UpdateCollectionDto,
} from './dto/collection.dto.js';

// REST controller for bookmark collections. All endpoints require authentication.
@Controller('collections')
@UseGuards(JwtAuthGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  // Create a new bookmark collection.
  @Post()
  @ApiResponse({ status: 201, type: Object })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateCollectionDto,
  ): Promise<any> {
    return await this.collectionsService.create(user.profileId, dto);
  }

  // List all collections for the authenticated user.
  @Get()
  @ApiResponse({ status: 200 })
  findAll(@CurrentUser() user: CurrentUserData) {
    return this.collectionsService.findAll(user.profileId);
  }

  // Get a single collection by ID.
  @Get(':id')
  @ApiResponse({ status: 200, type: Object })
  findOne(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.collectionsService.findOne(user.profileId, id);
  }

  // Rename / update a collection (name required; description optional).
  @Patch(':id')
  @ApiResponse({ status: 200, type: Object })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.collectionsService.update(user.profileId, id, dto);
  }

  // Delete a collection.
  @Delete(':id')
  @ApiResponse({ status: 200, type: Object })
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.collectionsService.delete(user.profileId, id);
  }
}
