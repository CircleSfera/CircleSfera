import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { clientIp } from '../abuse/device-signal.service.js';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ApplyFoundingCreatorDto } from './dto/apply-founding-creator.dto.js';
import { StartFreeYearDto } from './dto/start-free-year.dto.js';
import { FoundingCreatorsService } from './founding-creators.service.js';

// The founding creator application of the Creator Profile in use, by its
// owner only: no route here opens to a team member's session.
//
// Public contract addition decided by the owner under BD-034: GET and POST
// founding-creators and POST founding-creators/free-year.
@Controller('founding-creators')
@UseGuards(JwtAuthGuard)
export class FoundingCreatorsController {
  constructor(private readonly service: FoundingCreatorsService) {}

  @Get()
  @ApiResponse({ status: 200 })
  status(@CurrentUser() user: CurrentUserData) {
    return this.service.status(user.userId, user.profileId);
  }

  @Post()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @ApiResponse({ status: 201 })
  apply(
    @CurrentUser() user: CurrentUserData,
    @Body() body: ApplyFoundingCreatorDto,
  ) {
    return this.service.apply(user.userId, user.profileId, body);
  }

  // Starts the free year of an approved application once it can start, the
  // person accepting its terms.
  @Post('free-year')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @ApiResponse({ status: 200 })
  startFreeYear(
    @CurrentUser() user: CurrentUserData,
    @Body() _body: StartFreeYearDto,
    @Req() req: Request,
  ) {
    return this.service.startFreeYear(
      user.userId,
      user.profileId,
      clientIp(req),
    );
  }
}
