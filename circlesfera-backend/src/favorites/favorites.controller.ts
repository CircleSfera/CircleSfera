import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FavoritesService } from './favorites.service.js';

// The signed-in Profile's own Favorites. Closed to team member sessions: a
// Business Profile's Favorites are its owner's reading list.
@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @ApiResponse({ status: 200 })
  async list(@CurrentUser() user: CurrentUserData) {
    return this.favoritesService.list(user.profileId);
  }

  @Post(':profileId')
  @ApiResponse({ status: 201 })
  async add(
    @CurrentUser() user: CurrentUserData,
    @Param('profileId') profileId: string,
  ) {
    return this.favoritesService.add(user.profileId, profileId);
  }

  @Delete(':profileId')
  @ApiResponse({ status: 200 })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('profileId') profileId: string,
  ) {
    return this.favoritesService.remove(user.profileId, profileId);
  }
}
