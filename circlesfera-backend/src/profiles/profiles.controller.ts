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
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ProfilesService } from './profiles.service.js';

/** REST controller for user profiles, username validation, and account management. */
@Controller('profiles')
export class ProfilesController {
  constructor(
    @Inject(ProfilesService) private readonly profilesService: ProfilesService,
  ) {}

  /** Search for profiles by username or full name. */
  @Get('search')
  async searchProfiles(@Query('q') query: string) {
    return this.profilesService.searchProfiles(query);
  }

  /** Get the authenticated user's own profile. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyProfile(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.getMyProfile(user.userId);
  }

  /** Check if a username is available and valid. */
  @Get('check-username/:username')
  checkUsername(@Param('username') username: string) {
    return this.profilesService.checkUsernameAvailability(username);
  }

  /** Get a public profile by username. */
  @Get(':username')
  async getProfile(@Param('username') username: string) {
    return this.profilesService.getProfile(username);
  }

  /** Update the authenticated user's profile. */
  @Put('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.updateProfile(user.userId, dto);
  }

  /** Deactivate the authenticated user's account. */
  @Post('me/deactivate')
  @UseGuards(JwtAuthGuard)
  async deactivateAccount(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.deactivateAccount(user.userId);
  }

  /** Permanently delete the authenticated user's account. */
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.deleteAccount(user.userId);
  }
}
