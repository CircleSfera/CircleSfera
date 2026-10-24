import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ProfileStrikesService } from './profile-strikes.service.js';

@ApiTags('Moderation')
@Controller('strikes')
export class ProfileStrikesController {
  constructor(private readonly strikesService: ProfileStrikesService) {}

  // Warnings and strikes of the Profile the session acts as.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: [Object] })
  findMine(@CurrentUser() user: CurrentUserData) {
    return this.strikesService.listForProfile(user.profileId);
  }
}
