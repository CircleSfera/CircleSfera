import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import {
  type StaffPermission,
  staffHoldsPermission,
} from '../auth/guards/admin.guard.js';
import {
  ADMIN_JWT_AUDIENCE,
  type AdminJwtPayload,
  AdminJwtStrategy,
} from '../auth/strategies/admin-jwt.strategy.js';
import { getAdminJwtSecret } from '../common/config/admin-jwt.config.js';
import { ADMIN_ACCESS_TOKEN_COOKIE } from '../common/config/cookie.config.js';

/**
 * Whether a file is asked for by a member of staff who moderates content:
 * the staff session of the Admin Panel, checked as its own routes check it
 * (signed for staff, second factor verified, identity active), holding the
 * content permission. The staff cookie belongs to the staff site only, so a
 * file is recognised as staff's only when asked for there. Never throws: a
 * missing or bad session is simply not staff.
 */
@Injectable()
export class MediaStaffViewerService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AdminJwtStrategy) private readonly staffSessions: AdminJwtStrategy,
  ) {}

  async isContentStaff(req: Pick<Request, 'cookies'>): Promise<boolean> {
    return this.holds(req, 'content');
  }

  // Whether the file is asked for by whoever reads the review area: an
  // external reviewer, or staff holding the review permission.
  async isReviewer(req: Pick<Request, 'cookies'>): Promise<boolean> {
    return this.holds(req, 'review');
  }

  private async holds(
    req: Pick<Request, 'cookies'>,
    permission: StaffPermission,
  ): Promise<boolean> {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      ADMIN_ACCESS_TOKEN_COOKIE
    ];
    if (!token) return false;
    try {
      const payload = await this.jwt.verifyAsync<AdminJwtPayload>(token, {
        secret: getAdminJwtSecret(this.config),
        audience: ADMIN_JWT_AUDIENCE,
      });
      const staff = await this.staffSessions.validate(payload);
      return staffHoldsPermission(staff, permission);
    } catch {
      return false;
    }
  }
}
