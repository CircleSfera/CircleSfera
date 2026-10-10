import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as qrcode from 'qrcode';
import { CryptoService } from '../../common/services/crypto.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(CryptoService) private readonly cryptoService: CryptoService,
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
      data: { twoFactorSecret: this.cryptoService.encrypt(secret) },
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
    // The secret is the one of the sign-in: the first of the account, which
    // its Profiles share. It is written through the account, and the
    // database copies it to the sign-in in the same transaction.
    const userData = await this.prisma.signIn.findFirst({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { twoFactorSecret: true },
    });

    if (!userData?.twoFactorSecret) {
      return false;
    }

    const rawSecret = userData.twoFactorSecret;
    const decryptedSecret = this.cryptoService.decrypt(rawSecret);

    const valid = verifySync({
      token: twoFactorAuthenticationCode,
      secret: decryptedSecret,
      epochTolerance: 120,
    }).valid;

    // Opportunistic rolling migration for legacy plaintext secrets
    if (valid && !rawSecret.includes(':')) {
      void this.prisma.user
        .update({
          where: { id: user.id },
          data: {
            twoFactorSecret: this.cryptoService.encrypt(decryptedSecret),
          },
        })
        .catch(() => undefined);
    }

    return valid;
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
