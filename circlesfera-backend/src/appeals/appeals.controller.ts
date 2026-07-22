import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { AppealsService } from './appeals.service.js';
import { CreateAppealDto } from './dto/create-appeal.dto.js';
import { UpdateAppealDto } from './dto/update-appeal.dto.js';

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

    // 1. Try to get userId from the JWT payload if they are fully authenticated (Post Removal)
    if (req.user?.userId) {
      userId = req.user.userId;
    } else {
      // 2. Try to get userId from appealToken (Account Ban)
      const appealToken = req.headers['x-appeal-token'] || req.body.appealToken;
      if (appealToken) {
        try {
          const payload = this.jwtService.verify(appealToken, {
            secret: this.configService.get('JWT_SECRET'),
          });
          if (payload.isAppealToken) {
            userId = payload.sub;
          }
        } catch {
          throw new UnauthorizedException('Invalid or expired appeal token');
        }
      }
    }

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.appealsService.create(userId, createAppealDto);
  }

  @Get('my-appeals')
  @UseGuards(JwtAuthGuard)
  findMyUserAppeals(@CurrentUser('userId') userId: string) {
    return this.appealsService.findMyUserAppeals(userId);
  }

  // Admin Routes
  @Get('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  findAll() {
    return this.appealsService.findAll();
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Param('id') id: string, @Body() updateAppealDto: UpdateAppealDto) {
    return this.appealsService.update(id, updateAppealDto);
  }
}
