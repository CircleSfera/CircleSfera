import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as qrcode from 'qrcode';
import {
  FIRST_SIGN_IN_ORDER,
  sessionSignInWhere,
} from '../../common/auth/sign-in-lookup.js';
import { CryptoService } from '../../common/services/crypto.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(CryptoService) private readonly cryptoService: CryptoService,
  ) {}

  // The sign-in of the session: the one it names, or the first of the
  // account for a session that names none. The second step belongs to it.
  private async signInOf(user: { id: string; signInId?: string }) {
    return this.prisma.signIn.findFirst({
      where: sessionSignInWhere({ userId: user.id, signInId: user.signInId }),
      orderBy: FIRST_SIGN_IN_ORDER,
      select: { id: true, twoFactorSecret: true },
    });
  }

  public async generateTwoFactorAuthenticationSecret(user: {
    email: string;
    id: string;
    signInId?: string;
  }) {
    const secret = generateSecret();
    const appName = this.configService.get('APP_NAME') || 'CircleSfera';
    const otpauthUrl = generateURI({
      issuer: appName,
      label: user.email,
      secret,
    });

    const signIn = await this.signInOf(user);
    if (!signIn) {
      throw new BadRequestException('Sign-in not found');
    }
    await this.prisma.signIn.update({
      where: { id: signIn.id },
      data: { twoFactorSecret: this.cryptoService.encrypt(secret) },
    });

    return { secret, otpauthUrl };
  }

  public async generateQrCodeDataURL(otpAuthUrl: string) {
    return qrcode.toDataURL(otpAuthUrl);
  }

  public async isTwoFactorAuthenticationCodeValid(
    twoFactorAuthenticationCode: string,
    user: { id: string; signInId?: string },
  ) {
    const userData = await this.signInOf(user);

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
      void this.prisma.signIn
        .update({
          where: { id: userData.id },
          data: {
            twoFactorSecret: this.cryptoService.encrypt(decryptedSecret),
          },
        })
        .catch(() => undefined);
    }

    return valid;
  }

  public async turnOnTwoFactorAuthentication(
    userId: string,
    code: string,
    signInId?: string,
  ) {
    await this.switchTwoFactor({ id: userId, signInId }, code, {
      isTwoFactorEnabled: true,
    });
  }

  // Checks the code against the sign-in and writes the change on that same
  // sign-in. No sign-in, or a wrong code, changes nothing.
  private async switchTwoFactor(
    user: { id: string; signInId?: string },
    code: string,
    data: { isTwoFactorEnabled: boolean; twoFactorSecret?: null },
  ) {
    const isCodeValid = await this.isTwoFactorAuthenticationCodeValid(
      code,
      user,
    );
    const signIn = isCodeValid ? await this.signInOf(user) : null;
    if (!signIn) {
      throw new BadRequestException('Invalid authentication code');
    }

    await this.prisma.signIn.update({ where: { id: signIn.id }, data });
  }

  public async turnOffTwoFactorAuthentication(
    userId: string,
    code: string,
    signInId?: string,
  ) {
    await this.switchTwoFactor({ id: userId, signInId }, code, {
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
    });
  }
}
