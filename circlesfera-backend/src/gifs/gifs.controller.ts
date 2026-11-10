import { ErrorCode } from '@circlesfera/shared';
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { toSupportedLocale } from '../common/constants/locale.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GifPageDto, GifSearchDto } from './dto/gif-search.dto.js';
import { GiphyService } from './giphy.service.js';

// The GIF picker of the chat: whether GIFs are offered, and pages of GIFs
// from GIPHY, asked by the server for a signed-in Profile.
@Controller('gifs')
@UseGuards(JwtAuthGuard)
export class GifsController {
  constructor(
    @Inject(GiphyService) private readonly giphy: GiphyService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiResponse({ status: 200 })
  status() {
    return { available: this.giphy.available() };
  }

  @Get('trending')
  @Throttle({ short: { limit: 60, ttl: 60000 } })
  @ApiResponse({ status: 200 })
  async trending(@Query() page: GifPageDto) {
    this.assertAvailable();
    return { data: await this.giphy.trending(page.offset ?? 0) };
  }

  @Get('search')
  @Throttle({ short: { limit: 60, ttl: 60000 } })
  @ApiResponse({ status: 200 })
  async search(
    @CurrentUser() user: CurrentUserData,
    @Query() search: GifSearchDto,
  ) {
    this.assertAvailable();
    // Words are searched in the language of the person's account.
    const account = await this.prisma.profile.findUnique({
      where: { id: user.profileId },
      select: { user: { select: { locale: true } } },
    });
    return {
      data: await this.giphy.search(
        search.q,
        search.offset ?? 0,
        toSupportedLocale(account?.user?.locale),
      ),
    };
  }

  private assertAvailable() {
    if (!this.giphy.available()) {
      throw AppException.NotFound(
        ErrorCode.GIFS_UNAVAILABLE,
        'GIFs are not available',
      );
    }
  }
}
