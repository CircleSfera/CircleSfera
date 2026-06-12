import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface CurrentUserData {
  userId: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

interface RequestWithUser extends Request {
  user: CurrentUserData;
}

export const CurrentUser = createParamDecorator(
  // biome-ignore lint/correctness/noUnusedFunctionParameters: data is mandatory for NestJS decorators but not used here
  (data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
