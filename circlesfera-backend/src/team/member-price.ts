import { ErrorCode } from '@circlesfera/shared';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { AppException } from '../common/errors/app.exception.js';

// Putting a price on content is money, which stays with the owner of the
// Profile (PD-014): a team member publishes free content only.
export function refuseMemberPrice(
  user: Pick<CurrentUserData, 'memberRole'>,
  priceCents: number | null | undefined,
): void {
  if (user.memberRole && (priceCents ?? 0) > 0) {
    throw AppException.Forbidden(
      ErrorCode.TEAM_MEMBER_NOT_ALLOWED,
      'Only the owner of this profile sets a price on content',
    );
  }
}
