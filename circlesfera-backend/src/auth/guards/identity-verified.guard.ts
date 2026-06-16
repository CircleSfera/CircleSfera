import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
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
      throw new ForbiddenException(
        'Debes verificar tu identidad primero para poder comprar o cobrar.',
      );
    }

    return true;
  }
}
