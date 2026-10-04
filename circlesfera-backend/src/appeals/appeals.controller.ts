import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { AppealsService } from './appeals.service.js';
import { CreateAppealDto } from './dto/create-appeal.dto.js';
import { UpdateAppealDto } from './dto/update-appeal.dto.js';

@ApiTags('Moderation')
@Controller('appeals')
export class AppealsController {
  constructor(
    private readonly appealsService: AppealsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @UseGuards(JwtOptionalGuard)
  create(@Req() req: any, @Body() createAppealDto: CreateAppealDto) {
    let userId: string | undefined;
    let appealProfileId: string | undefined;

    if (req.user?.userId) {
      userId = req.user.userId;
    } else {
      const appealToken = req.headers['x-appeal-token'] || req.body.appealToken;
      if (appealToken) {
        try {
          const secret = this.configService.getOrThrow<string>('JWT_SECRET');
          const payload = this.jwtService.verify(appealToken, {
            secret,
          });
          if (payload.isAppealToken) {
            userId = payload.sub;
            appealProfileId =
              typeof payload.profileId === 'string'
                ? payload.profileId
                : undefined;
          }
        } catch {
          throw new UnauthorizedException('Invalid or expired appeal token');
        }
      }
    }

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    // An appeal filed from the login screen is about the Profile that could
    // not sign in.
    if (
      appealProfileId &&
      createAppealDto.targetType === 'ACCOUNT_BAN' &&
      !createAppealDto.targetId
    ) {
      createAppealDto.targetId = appealProfileId;
    }

    return this.appealsService.create(userId, createAppealDto);
  }

  @Get('my-appeals')
  @UseGuards(JwtAuthGuard)
  findMyUserAppeals(@CurrentUser() user: CurrentUserData) {
    return this.appealsService.findMyUserAppeals(user.userId);
  }

  @Get('admin')
  @UseGuards(AdminJwtAuthGuard, AdminGuard)
  @RequireStaffPermissions('appeals')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.appealsService.findAll(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      status,
    );
  }

  @Patch('admin/:id')
  @UseGuards(AdminJwtAuthGuard, AdminGuard)
  @RequireStaffPermissions('appeals')
  update(
    @Param('id') id: string,
    @Body() updateAppealDto: UpdateAppealDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.appealsService.update(id, updateAppealDto, admin.adminId);
  }
}
