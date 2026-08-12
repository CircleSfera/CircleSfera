import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Request.user shape for Admin Panel (AdminJwtStrategy). */
export interface CurrentAdminData {
  adminId: string;
  email: string;
  displayName: string;
  permissions: string[];
  roles: string[];
  /** True when JWT includes a recent step-up claim. */
  stepUpVerified?: boolean;
  /**
   * Compatibility alias: admin services historically used userId for audit actor.
   * Always equals adminId for Admin Panel sessions.
   */
  userId: string;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentAdminData => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as CurrentAdminData;
  },
);
