import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface CurrentUserData {
  userId: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  profileId: string;
  // The sign-in that opened the session.
  signInId?: string;
  // The session the request belongs to. Absent in tokens issued before
  // they carried it.
  sessionId?: string;
  // Test Account. Read from the database on every request, never
  // from the token, so it cannot be forged or go stale.
  isTestAccount: boolean;
  // Set when the session acts as a Profile the person works on as a team
  // member, with their role (ADR-0028).
  memberRole?: 'ADMINISTRATOR' | 'EDITOR';
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
    if (data) return user[data] ?? null;
    return user;
  },
);
