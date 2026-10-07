import { ErrorCode } from '@circlesfera/shared';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class IdentityVerifiedGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.userId) {
      throw new ForbiddenException(
        'Debes iniciar sesión para realizar esta acción.',
      );
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { identityVerifiedAt: true, isActive: true },
    });

    if (!dbUser) {
      throw new ForbiddenException('Usuario no encontrado.');
    }

    if (!dbUser.isActive) {
      throw new ForbiddenException('Tu cuenta está suspendida o inactiva.');
    }

    if (!dbUser.identityVerifiedAt) {
      // The code lets the app offer the verification. The sentence is kept
      // as it was: app versions still open in a browser recognise it.
      throw AppException.Forbidden(
        ErrorCode.IDENTITY_VERIFICATION_REQUIRED,
        'Debes verificar tu identidad primero para poder comprar o cobrar.',
      );
    }

    return true;
  }
}
