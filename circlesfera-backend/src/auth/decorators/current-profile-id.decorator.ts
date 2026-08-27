import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentProfileId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    // Assuming we inject activeProfileId into req.user
    return request.user?.profileId;
  },
);
