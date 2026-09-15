import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { MapBboxDto } from './dto/map-bbox.dto.js';
import { PlacesService } from './places.service.js';

@ApiTags('Places')
@Controller('places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('map')
  getMap(@Query() bbox: MapBboxDto, @CurrentUser() user: CurrentUserData) {
    return this.placesService.getMapPins(bbox, user.profileId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.placesService.findOne(id, user.profileId);
  }

  @Get(':id/posts')
  getPosts(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.placesService.getPlacePosts(id, pagination, user.profileId);
  }
}
