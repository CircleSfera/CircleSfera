import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto.js';
import { TwoFactorService } from './two-factor.service.js';

interface AuthRequest {
  user: { userId: string; email: string; role: string };
}

@ApiTags('2FA')
@Controller('2fa')
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a new 2FA secret and QR code URL' })
  async generate(@Req() req: AuthRequest, @Res() res: Response) {
    const { otpauthUrl } =
      await this.twoFactorService.generateTwoFactorAuthenticationSecret({
        id: req.user.userId,
        email: req.user.email,
      });

    const qrCodeDataUrl =
      await this.twoFactorService.generateQrCodeDataURL(otpauthUrl);

    return res.json({
      qrCodeDataUrl,
    });
  }

  @Post('turn-on')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Turn on 2FA' })
  async turnOn(@Req() req: AuthRequest, @Body() body: TwoFactorCodeDto) {
    await this.twoFactorService.turnOnTwoFactorAuthentication(
      req.user.userId,
      body.twoFactorAuthenticationCode,
    );
    return { message: '2FA has been turned on successfully' };
  }

  @Post('turn-off')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Turn off 2FA' })
  async turnOff(@Req() req: AuthRequest, @Body() body: TwoFactorCodeDto) {
    await this.twoFactorService.turnOffTwoFactorAuthentication(
      req.user.userId,
      body.twoFactorAuthenticationCode,
    );
    return { message: '2FA has been turned off successfully' };
  }
}
