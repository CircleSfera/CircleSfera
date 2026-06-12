import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieOptions,
} from '../../common/config/cookie.config.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for DI
import { AuthService } from '../auth.service.js';
import {
  CurrentUser,
  type CurrentUserData,
} from '../decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import type {
  AuthenticatePasskeyDto,
  GetPasskeyOptionsDto,
  RegisterPasskeyDto,
} from './dto/passkey.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for DI
import { PasskeyService } from './passkey.service.js';

/** REST controller for FIDO2/WebAuthn passkey registration and authentication. */
@Controller('auth/passkey')
export class PasskeyController {
  constructor(
    private readonly passkeyService: PasskeyService,
    private readonly authService: AuthService,
  ) {}

  /** List all registered passkeys for the current user. */
  @UseGuards(JwtAuthGuard)
  @Get()
  async listPasskeys(@CurrentUser() user: CurrentUserData) {
    return this.passkeyService.getUserPasskeys(user.userId);
  }

  /** Generate WebAuthn registration options (requires auth). */
  @UseGuards(JwtAuthGuard)
  @Post('register-options')
  async generateRegistrationOptions(@CurrentUser() user: CurrentUserData) {
    return this.passkeyService.generateRegistrationOptions(user.userId);
  }

  /** Verify WebAuthn registration and store the passkey (requires auth). */
  @UseGuards(JwtAuthGuard)
  @Post('register-verify')
  async verifyRegistration(
    @CurrentUser() user: CurrentUserData,
    @Body() body: RegisterPasskeyDto,
  ) {
    return this.passkeyService.verifyRegistration(
      user.userId,
      body.registrationResponse,
    );
  }

  /** Generate WebAuthn authentication options for passwordless login. */
  @Post('login-options')
  async generateAuthenticationOptions(@Body() dto: GetPasskeyOptionsDto) {
    return this.passkeyService.generateAuthenticationOptions(dto.email);
  }

  /** Verify WebAuthn authentication response and issue JWT tokens as HTTP-only cookies. */
  @Post('login-verify')
  @HttpCode(HttpStatus.OK)
  async verifyAuthentication(
    @Body() body: AuthenticatePasskeyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const result = await this.passkeyService.verifyAuthentication(
      body.email,
      body.authenticationResponse,
    );

    if (result.verified && result.userId) {
      const tokens = await this.authService.loginById(result.userId);
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
      return { message: 'Passkey login successful' };
    }

    throw new UnauthorizedException('Passkey authentication failed');
  }

  /** Delete a registered passkey (requires auth). */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deletePasskey(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    return this.passkeyService.deletePasskey(user.userId, id);
  }
}
