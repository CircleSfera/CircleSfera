import {
  AD_CHOICES,
  AD_CONSENT_SOURCES,
  AD_CONSENT_TEXT_VERSION_PARAM,
  type AdChoice,
  type AdConsentSource,
  type AdConsentStatus,
} from '@circlesfera/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Locale } from '@prisma/client';
import { IsEnum, IsIn, IsString, MaxLength } from 'class-validator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdsConsentService } from './ads-consent.service.js';

export class AnswerAdConsentDto {
  @IsIn(AD_CHOICES)
  choice!: AdChoice;

  // The version of the texts the app showed.
  @IsString()
  @MaxLength(32)
  textVersion!: string;

  // The language the texts were shown in.
  @IsEnum(Locale)
  locale!: Locale;

  @IsIn(AD_CONSENT_SOURCES)
  source!: AdConsentSource;
}

// The person's answer to "How should your ads be chosen?" (PD-084). Of the
// User, for every Profile of the person. No verified email is asked for: the
// screen comes right after sign-up, and withdrawing must be as easy as giving.
@Controller('users/me/ads-consent')
@UseGuards(JwtAuthGuard)
export class AdsConsentController {
  constructor(
    @Inject(AdsConsentService) private readonly adsConsent: AdsConsentService,
  ) {}

  // `textVersion`: the texts the asking app carries. An app with other texts
  // (an older bundle) is not asked to show the screen.
  @Get()
  @ApiQuery({ name: AD_CONSENT_TEXT_VERSION_PARAM, required: false })
  @ApiResponse({ status: 200 })
  status(
    @CurrentUser() user: CurrentUserData,
    @Query(AD_CONSENT_TEXT_VERSION_PARAM) textVersion?: string,
  ): Promise<AdConsentStatus> {
    return this.adsConsent.status(
      user.userId,
      typeof textVersion === 'string' ? textVersion : undefined,
    );
  }

  @Put()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiResponse({ status: 200 })
  answer(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AnswerAdConsentDto,
  ): Promise<AdConsentStatus> {
    return this.adsConsent.answer(user.userId, dto);
  }
}
