import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Request, Response } from 'express';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  ADMIN_REFRESH_TOKEN_COOKIE,
  adminAccessTokenCookieOptions,
  adminRefreshTokenCookieOptions,
} from '../common/config/cookie.config.js';
import { AdminAuthService } from './admin-auth.service.js';
import {
  AdminPasskeyLoginDto,
  AdminPasskeyRegisterDto,
} from './dto/admin-auth.dto.js';
import { StaffPasskeyService } from './staff-passkey.service.js';

// Adding or removing a passkey changes how the identity signs in: it needs
// the authenticator code given moments ago, as any sensitive staff action.
function assertSteppedUp(admin: CurrentAdminData): void {
  if (!admin.stepUpVerified) {
    throw new UnauthorizedException({
      message: 'ADMIN_STEP_UP_REQUIRED',
      code: 'ADMIN_STEP_UP_REQUIRED',
    });
  }
}

@ApiTags('Admin Authentication')
@Controller('admin-auth/passkeys')
@UseGuards(ThrottlerGuard)
export class StaffPasskeyController {
  constructor(
    @Inject(StaffPasskeyService)
    private readonly passkeys: StaffPasskeyService,
    @Inject(AdminAuthService)
    private readonly adminAuthService: AdminAuthService,
  ) {}

  private clientMeta(req: Request) {
    return {
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    };
  }

  // Options to sign in with a staff passkey of this device.
  @Post('login/options')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @ApiResponse({ status: HttpStatus.OK })
  async loginOptions() {
    return this.passkeys.authenticationOptions();
  }

  // Signs in with a staff passkey; the tokens go only into the cookies.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @ApiResponse({ status: HttpStatus.OK })
  async login(
    @Body() dto: AdminPasskeyLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const adminId = await this.passkeys.authenticate(
      dto.response as unknown as AuthenticationResponseJSON,
    );
    const tokens = await this.adminAuthService.signInWithPasskey(
      adminId,
      this.clientMeta(req),
    );
    res.cookie(
      ADMIN_ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      adminAccessTokenCookieOptions,
    );
    res.cookie(
      ADMIN_REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      adminRefreshTokenCookieOptions,
    );
    return { status: 'SIGNED_IN' };
  }

  @Get()
  @UseGuards(AdminJwtAuthGuard)
  @ApiResponse({ status: HttpStatus.OK })
  async list(@CurrentAdmin() admin: CurrentAdminData) {
    return this.passkeys.list(admin.adminId);
  }

  @Post('register/options')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiResponse({ status: HttpStatus.OK })
  async registerOptions(@CurrentAdmin() admin: CurrentAdminData) {
    assertSteppedUp(admin);
    return this.passkeys.registrationOptions(admin);
  }

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiResponse({ status: HttpStatus.OK })
  async register(
    @CurrentAdmin() admin: CurrentAdminData,
    @Body() dto: AdminPasskeyRegisterDto,
    @Req() req: Request,
  ) {
    assertSteppedUp(admin);
    return this.passkeys.register(
      admin.adminId,
      dto.response as unknown as RegistrationResponseJSON,
      dto.name,
      this.clientMeta(req),
    );
  }

  @Delete(':id')
  @UseGuards(AdminJwtAuthGuard)
  @ApiResponse({ status: HttpStatus.OK })
  async remove(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    assertSteppedUp(admin);
    await this.passkeys.remove(admin.adminId, id, this.clientMeta(req));
    return { status: 'OK' };
  }
}
