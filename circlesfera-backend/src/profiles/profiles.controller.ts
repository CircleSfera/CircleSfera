import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ProfilesService } from './profiles.service.js';

// REST controller for user profiles, username validation, and account management.
@ApiTags('Profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(
    @Inject(ProfilesService) private readonly profilesService: ProfilesService,
  ) {}

  // Search for profiles by username or full name.
  @Get('search')
  async searchProfiles(@Query('q') query: string) {
    return this.profilesService.searchProfiles(query);
  }

  // Get the authenticated user's referrals.
  @Get('me/referrals')
  @UseGuards(JwtAuthGuard)
  async getMyReferrals(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.getMyReferrals(user.profileId);
  }

  // Get the authenticated user's own profile.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyProfile(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.getMyProfile(user.profileId);
  }

  // Check if a username is available and valid.
  @Get('check-username/:username')
  checkUsername(@Param('username') username: string) {
    return this.profilesService.checkUsernameAvailability(username);
  }

  // Get a public profile by username. Hidden from either side of a block.
  @Get(':username')
  @UseGuards(JwtOptionalGuard)
  async getProfile(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData | null,
  ) {
    return this.profilesService.getProfile(username, user?.profileId);
  }

  // Update the authenticated user's profile.
  @Put('me')
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  async updateProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.updateProfile(user.profileId, dto);
  }

  // Deactivate the authenticated user's account.
  @Post('me/deactivate')
  @UseGuards(JwtAuthGuard)
  async deactivateAccount(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.deactivateAccount(user.profileId);
  }

  // Permanently delete the authenticated user's account.
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.deleteAccount(user.profileId);
  }
}
