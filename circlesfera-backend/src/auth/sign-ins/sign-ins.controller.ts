import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type CurrentUserData,
} from '../decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { OwnSignInDto } from './dto/own-sign-in.dto.js';
import { ShareSignInDto } from './dto/share-sign-in.dto.js';
import { SignInsService } from './sign-ins.service.js';

// A few tries a minute: each one checks a password or a passkey.
const PROOF_THROTTLE = { medium: { limit: 5, ttl: 60000 } };

// How the Profiles of the signed-in person sign in.
@Controller('sign-ins')
@UseGuards(JwtAuthGuard)
export class SignInsController {
  constructor(
    @Inject(SignInsService) private readonly signIns: SignInsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserData) {
    return this.signIns.list(user);
  }

  // A Profile gets an email and a password of its own.
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle(PROOF_THROTTLE)
  async giveOwn(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: OwnSignInDto,
  ) {
    const { currentPassword, passkeyAssertion, ...input } = dto;
    return this.signIns.giveOwn(user, input, {
      currentPassword,
      passkeyAssertion,
    });
  }

  // A Profile goes back to a sign-in it shares.
  @Post('share')
  @HttpCode(HttpStatus.OK)
  @Throttle(PROOF_THROTTLE)
  async share(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ShareSignInDto,
  ) {
    const { currentPassword, passkeyAssertion, ...input } = dto;
    return this.signIns.share(user, input, {
      currentPassword,
      passkeyAssertion,
    });
  }
}
