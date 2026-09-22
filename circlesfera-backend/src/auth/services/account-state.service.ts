import { ApiErrorCode } from '@circlesfera/shared';
import { Injectable, UnauthorizedException } from '@nestjs/common';

export interface UserAccountStateInput {
  id: string;
  isActive: boolean;
  isRootBanned?: boolean;
  rootBanReason?: string | null;
  deletedAt?: Date | null;
  scheduledDeletionAt?: Date | null;
}

export interface ProfileAccountStateInput {
  id?: string;
  isAccountBanned?: boolean;
  accountBanReason?: string | null;
  suspendedUntil?: Date | null;
}

export type AccountStandingStatus =
  | 'ACTIVE'
  | 'BANNED'
  | 'SUSPENDED'
  | 'SCHEDULED_DELETION'
  | 'DEACTIVATED';

export interface AccountStateEvaluation {
  status: AccountStandingStatus;
  isOperational: boolean;
  reason?: string | null;
  suspendedUntil?: Date | null;
  scheduledDeletionAt?: Date | null;
}

@Injectable()
export class AccountStateService {
  /**
   * Pure evaluation of account standing across User and Profile dimensions.
   */
  evaluate(
    user: UserAccountStateInput | null | undefined,
    profile?: ProfileAccountStateInput | null,
  ): AccountStateEvaluation {
    if (!user) {
      return {
        status: 'DEACTIVATED',
        isOperational: false,
        reason: 'User not found',
      };
    }

    // 1. Root / Profile Administrative Ban
    if (user.isRootBanned) {
      return {
        status: 'BANNED',
        isOperational: false,
        reason: user.rootBanReason || 'Account is banned by administration',
      };
    }

    if (profile?.isAccountBanned) {
      return {
        status: 'BANNED',
        isOperational: false,
        reason:
          profile.accountBanReason || 'Account is banned by administration',
      };
    }

    // 2. Profile Temporary Suspension
    if (
      profile?.suspendedUntil &&
      new Date(profile.suspendedUntil) > new Date()
    ) {
      return {
        status: 'SUSPENDED',
        isOperational: false,
        reason: 'Account is temporarily suspended',
        suspendedUntil: new Date(profile.suspendedUntil),
      };
    }

    // 3. Deletion Scheduled (Grace period deactivation)
    if (
      !user.isActive &&
      user.scheduledDeletionAt &&
      new Date(user.scheduledDeletionAt) > new Date()
    ) {
      return {
        status: 'SCHEDULED_DELETION',
        isOperational: false,
        reason: 'Account is scheduled for deletion',
        scheduledDeletionAt: new Date(user.scheduledDeletionAt),
      };
    }

    // 4. Regular Deactivation / Soft-deleted
    if (!user.isActive) {
      return {
        status: 'DEACTIVATED',
        isOperational: false,
        reason: 'Account is deactivated',
      };
    }

    // 5. Active and Operational
    return {
      status: 'ACTIVE',
      isOperational: true,
    };
  }

  /**
   * Helper returning true if the account is active, non-banned, and non-suspended.
   */
  isOperational(
    user: UserAccountStateInput | null | undefined,
    profile?: ProfileAccountStateInput | null,
  ): boolean {
    return this.evaluate(user, profile).isOperational;
  }

  /**
   * Enforces that the account is operational. Throws UnauthorizedException if standing is invalid.
   */
  assertOperational(
    user: UserAccountStateInput | null | undefined,
    profile?: ProfileAccountStateInput | null,
  ): void {
    const evaluation = this.evaluate(user, profile);

    if (evaluation.isOperational) {
      return;
    }

    switch (evaluation.status) {
      case 'BANNED':
        throw new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: evaluation.reason,
        });
      case 'SUSPENDED':
        throw new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_SUSPENDED,
          suspendedUntil: evaluation.suspendedUntil?.toISOString(),
        });
      default:
        throw new UnauthorizedException(
          'User not found or account deactivated',
        );
    }
  }
}
