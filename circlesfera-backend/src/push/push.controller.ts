import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { SubscribePushDto } from './dto/subscribe.dto.js';
import { PushService } from './push.service.js';

@Controller('push')
export class PushController {
  constructor(
    @Inject(PushService) private readonly pushService: PushService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  @Get('public-key')
  getPublicKey() {
    return { publicKey: this.configService.get<string>('VAPID_PUBLIC_KEY') };
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  async subscribe(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SubscribePushDto,
  ) {
    return this.pushService.subscribe(user.userId, dto);
  }

  @Delete('unsubscribe')
  @UseGuards(JwtAuthGuard)
  async unsubscribe(@Query('endpoint') endpoint: string) {
    return this.pushService.unsubscribe(endpoint);
  }
}
