import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { requestAbuseMeta } from '../../common/abuse/device-signal.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieOptions,
} from '../../common/config/cookie.config.js';
import { AuthService } from '../auth.service.js';
import {
  CurrentUser,
  type CurrentUserData,
} from '../decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import {
  AuthenticatePasskeyDto,
  DeletePasskeyDto,
  GetPasskeyOptionsDto,
  RegisterPasskeyDto,
} from './dto/passkey.dto.js';
import { PasskeyService } from './passkey.service.js';

// REST controller for FIDO2/WebAuthn passkey registration and authentication.
@Controller('auth/passkey')
export class PasskeyController {
  constructor(
    private readonly passkeyService: PasskeyService,
    private readonly authService: AuthService,
  ) {}

  // List all registered passkeys for the current user.
  @UseGuards(JwtAuthGuard)
  @Get()
  async listPasskeys(@CurrentUser() user: CurrentUserData) {
    return this.passkeyService.getUserPasskeys(user.userId);
  }

  // Generate WebAuthn registration options (requires auth).
  @UseGuards(JwtAuthGuard)
  @Post('register-options')
  async generateRegistrationOptions(@CurrentUser() user: CurrentUserData) {
    return this.passkeyService.generateRegistrationOptions(user.userId);
  }

  // Verify WebAuthn registration and store the passkey (requires auth).
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

  // Generate WebAuthn authentication options for passwordless login.
  @Post('login-options')
  async generateAuthenticationOptions(@Body() dto: GetPasskeyOptionsDto) {
    if (dto.sensitivity) {
      return this.passkeyService.generateAuthenticationOptions(
        dto.email,
        dto.sensitivity,
      );
    }
    return this.passkeyService.generateAuthenticationOptions(dto.email);
  }

  // Verify WebAuthn authentication response and issue JWT tokens as HTTP-only cookies.
  @Post('login-verify')
  @HttpCode(HttpStatus.OK)
  async verifyAuthentication(
    @Req() req: Request,
    @Body() body: AuthenticatePasskeyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const result = await this.passkeyService.verifyAuthentication(
      body.email,
      body.authenticationResponse,
    );

    if (result.verified && result.userId) {
      const tokens = await this.authService.loginById(
        result.userId,
        this.abuseMeta(req),
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
      return { message: 'Passkey login successful' };
    }

    throw new UnauthorizedException('Passkey authentication failed');
  }

  // Sensitive authentication options for the signed-in user (step-up before
  // removing a passkey).
  @UseGuards(JwtAuthGuard)
  @Post('step-up-options')
  async generateStepUpOptions(@CurrentUser() user: CurrentUserData) {
    return this.passkeyService.generateStepUpOptions(user.userId);
  }

  // Delete a registered passkey (requires auth and a fresh step-up assertion).
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deletePasskey(
    @CurrentUser() user: CurrentUserData,
    @Param('id') passkeyId: string,
    @Body() body: DeletePasskeyDto,
  ) {
    return this.passkeyService.deletePasskey(
      user.userId,
      passkeyId,
      body.authenticationResponse,
    );
  }

  private abuseMeta(req: Request) {
    return requestAbuseMeta(
      req as unknown as Parameters<typeof requestAbuseMeta>[0],
    );
  }
}
