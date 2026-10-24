import { ErrorCode } from '@circlesfera/shared';
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
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { clientIp } from '../common/abuse/device-signal.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieOptions,
} from '../common/config/cookie.config.js';
import { AppException } from '../common/errors/app.exception.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import { RecordsActivity } from '../team/records-activity.decorator.js';
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
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  async searchProfiles(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserData | null,
  ) {
    return this.profilesService.searchProfiles(query, user?.profileId);
  }

  // Get all profiles owned by the authenticated identity.
  @Get('my-profiles')
  @UseGuards(JwtAuthGuard)
  @MemberAllowed('session')
  @ApiResponse({ status: 200 })
  async getMyProfiles(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.getMyProfiles(user.userId);
  }

  // Create an additional profile under the authenticated user identity (max 5 per identity).
  @Post()
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  @ApiResponse({ status: 201 })
  async createProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateProfileDto,
  ) {
    return this.profilesService.createProfile(user.userId, dto);
  }

  // Switch the active session profile and reissue authentication cookies.
  @Post('switch/:profileId')
  @UseGuards(JwtAuthGuard)
  @MemberAllowed('session')
  @ApiResponse({ status: 201 })
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
    const ip = clientIp(req) || undefined;

    const tokens = await this.authService.generateTokens(
      user.userId,
      user.email,
      userAgent,
      ip,
      // The same session, on another Profile.
      user.sessionId,
      activeProfile.id,
      // Switching asks for no password: the session keeps its sign-in.
      user.signInId,
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

  // Get the authenticated user's own active profile.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @MemberAllowed('session')
  @ApiResponse({ status: 200, type: Object })
  async getMyProfile(@CurrentUser() user: CurrentUserData) {
    // A team member sees the Profile as anyone does, and their role.
    if (user.memberRole) {
      return this.profilesService.getMemberProfile(
        user.profileId,
        user.memberRole,
      );
    }
    return this.profilesService.getMyProfile(user.profileId, user.signInId);
  }

  // Check if a username is available and valid.
  @Get('check-username/:username')
  @ApiResponse({ status: 200 })
  checkUsername(@Param('username') username: string) {
    return this.profilesService.checkUsernameAvailability(username);
  }

  // Get a public profile by username. Hidden from either side of a block.
  @Get(':username')
  @UseGuards(JwtOptionalGuard)
  @MemberAllowed('browse')
  @ApiResponse({ status: 200, type: Object })
  async getProfile(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData | null,
  ) {
    return this.profilesService.getProfile(username, user?.profileId);
  }

  // Update the authenticated user's active profile.
  @Put('me')
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  @MemberAllowed('profile.edit')
  @RecordsActivity('PROFILE_EDITED')
  @ApiResponse({ status: 200, type: Object })
  async updateProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateProfileDto,
  ) {
    // Changing the kind of Profile would take it out of Business, which is
    // the owner's call.
    if (user.memberRole && dto.accountType !== undefined) {
      throw AppException.Forbidden(
        ErrorCode.TEAM_MEMBER_NOT_ALLOWED,
        'Only the owner changes the kind of this profile',
      );
    }
    const updated = await this.profilesService.updateProfile(
      user.profileId,
      dto,
    );
    // A member gets the Profile as a member sees it: the answer of the
    // update carries the owner's account (email, role).
    if (user.memberRole) {
      return this.profilesService.getMemberProfile(
        user.profileId,
        user.memberRole,
      );
    }
    return updated;
  }

  // Deactivate the authenticated user's account.
  @Post('me/deactivate')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 201 })
  async deactivateAccount(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.deactivateAccount(user.userId, user.profileId);
  }

  // Schedule deletion of the authenticated user's account (30-day grace).
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async deleteAccount(@CurrentUser() user: CurrentUserData) {
    return this.profilesService.deleteAccount(user.userId, user.profileId);
  }
}
