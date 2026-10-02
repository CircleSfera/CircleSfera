import {
  Body,
  Controller,
  Delete,
  forwardRef,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { clientIpFromHeaders } from '../common/abuse/device-signal.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieOptions,
} from '../common/config/cookie.config.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ProfilesService } from './profiles.service.js';

// REST controller for user profiles, username validation, multi-profile management, and account lifecycle.
@ApiTags('Profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(
    @Inject(ProfilesService) private readonly profilesService: ProfilesService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  // Search for profiles by username or full name. Hidden from either side of a block.
  @Get('search')
  @UseGuards(JwtOptionalGuard)
  async searchProfiles(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserData | null,
  ) {
    return this.profilesService.searchProfiles(query, user?.profileId);
  }

  // Get all profiles owned by the authenticated identity.
  @Get('my-profiles')
  @UseGuards(JwtAuthGuard)
  async getMyProfiles(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.getMyProfiles(user.userId);
  }

  // Create an additional profile under the authenticated user identity (max 5 per identity).
  @Post()
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  async createProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateProfileDto,
  ) {
    return this.profilesService.createProfile(user.userId, dto);
  }

  // Switch the active session profile and reissue authentication cookies.
  @Post('switch/:profileId')
  @UseGuards(JwtAuthGuard)
  async switchProfile(
    @CurrentUser() user: CurrentUserData,
    @Param('profileId') profileId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const activeProfile = await this.profilesService.switchProfile(
      user.userId,
      profileId,
    );

    const userAgent = req.headers['user-agent'] as string | undefined;
    const ip = clientIpFromHeaders(req.headers, req.ip) || undefined;

    const tokens = await this.authService.generateTokens(
      user.userId,
      user.email,
      userAgent,
      ip,
      undefined,
      activeProfile.id,
    );

    res.cookie(
      ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      accessTokenCookieOptions,
    );
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      refreshTokenCookieOptions,
    );

    return {
      message: 'Profile switched successfully',
      profile: activeProfile,
    };
  }

  // Get the authenticated user's referrals.
  @Get('me/referrals')
  @UseGuards(JwtAuthGuard)
  async getMyReferrals(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.getMyReferrals(user.profileId);
  }

  // Get the authenticated user's own active profile.
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

  // Update the authenticated user's active profile.
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
    return this.profilesService.deactivateAccount(user.userId, user.profileId);
  }

  // Schedule deletion of the authenticated user's account (30-day grace).
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.deleteAccount(user.userId, user.profileId);
  }
}
