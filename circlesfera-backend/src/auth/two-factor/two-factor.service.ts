import { BadRequestException, Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as qrcode from 'qrcode';
import type { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  public async generateTwoFactorAuthenticationSecret(user: {
    email: string;
    id: string;
  }) {
    const secret = generateSecret();
    const appName = this.configService.get('APP_NAME') || 'CircleSfera';
    const otpauthUrl = generateURI({
      issuer: appName,
      label: user.email,
      secret,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret },
    });

    return { secret, otpauthUrl };
  }

  public async generateQrCodeDataURL(otpAuthUrl: string) {
    return qrcode.toDataURL(otpAuthUrl);
  }

  public async isTwoFactorAuthenticationCodeValid(
    twoFactorAuthenticationCode: string,
    user: { id: string },
  ) {
    const userData = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!userData?.twoFactorSecret) {
      return false;
    }

    return verifySync({
      token: twoFactorAuthenticationCode,
      secret: userData.twoFactorSecret,
    }).valid;
  }

  public async turnOnTwoFactorAuthentication(userId: string, code: string) {
    const isCodeValid = await this.isTwoFactorAuthenticationCodeValid(code, {
      id: userId,
    });

    if (!isCodeValid) {
      throw new BadRequestException('Invalid authentication code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: true },
    });
  }

  public async turnOffTwoFactorAuthentication(userId: string, code: string) {
    const isCodeValid = await this.isTwoFactorAuthenticationCodeValid(code, {
      id: userId,
    });

    if (!isCodeValid) {
      throw new BadRequestException('Invalid authentication code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });
  }
}
