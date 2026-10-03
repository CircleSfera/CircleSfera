import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface CurrentUserData {
  userId: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  profileId: string;
  // Test Account. Read from the database on every request, never
  // from the token, so it cannot be forged or go stale.
  isTestAccount: boolean;
}

interface RequestWithUser extends Request {
  user?: CurrentUserData;
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof CurrentUserData | undefined,
    ctx: ExecutionContext,
  ): CurrentUserData | string | boolean | null => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return null;
    if (data) return user[data];
    return user;
  },
);
