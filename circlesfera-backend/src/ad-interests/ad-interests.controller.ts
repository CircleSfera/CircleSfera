import {
  AD_INTEREST_TOPICS,
  AD_INTERESTS_MAX,
  type AdInterestsStatus,
  type AdInterestTopic,
} from '@circlesfera/shared';
import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn } from 'class-validator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdInterestsService } from './ad-interests.service.js';

export class ChooseAdInterestsDto {
  // The whole set, replacing the one stored; empty clears it.
  @IsArray()
  @ArrayMaxSize(AD_INTERESTS_MAX)
  @ArrayUnique()
  @IsIn(AD_INTEREST_TOPICS, { each: true })
  topics!: AdInterestTopic[];
}

// The interests the person chooses for their ads (PD-084). Of the User, for
// every Profile of the person; only their own, read and written by the
// session's account.
@Controller('users/me/ad-interests')
@UseGuards(JwtAuthGuard)
export class AdInterestsController {
  constructor(
    @Inject(AdInterestsService)
    private readonly adInterests: AdInterestsService,
  ) {}

  @Get()
  @ApiResponse({ status: 200 })
  status(@CurrentUser() user: CurrentUserData): Promise<AdInterestsStatus> {
    return this.adInterests.status(user.userId);
  }

  @Put()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiResponse({ status: 200 })
  choose(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ChooseAdInterestsDto,
  ): Promise<AdInterestsStatus> {
    return this.adInterests.choose(user.userId, dto.topics);
  }
}
