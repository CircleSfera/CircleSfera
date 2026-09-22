import { ApiErrorCode } from '@circlesfera/shared';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  AccountStateService,
  type ProfileAccountStateInput,
  type UserAccountStateInput,
} from './account-state.service.js';

describe('AccountStateService', () => {
  const service = new AccountStateService();

  describe('evaluate & isOperational', () => {
    it('evaluates null or undefined user as DEACTIVATED and non-operational', () => {
      const evalNull = service.evaluate(null);
      expect(evalNull.status).toBe('DEACTIVATED');
      expect(evalNull.isOperational).toBe(false);
      expect(service.isOperational(null)).toBe(false);

      const evalUndefined = service.evaluate(undefined);
      expect(evalUndefined.status).toBe('DEACTIVATED');
      expect(evalUndefined.isOperational).toBe(false);
      expect(service.isOperational(undefined)).toBe(false);
    });

    it('evaluates root banned user as BANNED and non-operational', () => {
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: true,
        isRootBanned: true,
        rootBanReason: 'TOS spam violation',
      };
      const result = service.evaluate(user);
      expect(result.status).toBe('BANNED');
      expect(result.isOperational).toBe(false);
      expect(result.reason).toBe('TOS spam violation');
      expect(service.isOperational(user)).toBe(false);
    });

    it('evaluates profile banned user as BANNED and non-operational', () => {
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: true,
        isRootBanned: false,
      };
      const profile: ProfileAccountStateInput = {
        id: 'p-1',
        isAccountBanned: true,
        accountBanReason: 'Abusive profile behavior',
      };
      const result = service.evaluate(user, profile);
      expect(result.status).toBe('BANNED');
      expect(result.isOperational).toBe(false);
      expect(result.reason).toBe('Abusive profile behavior');
      expect(service.isOperational(user, profile)).toBe(false);
    });

    it('evaluates future suspendedUntil as SUSPENDED and non-operational', () => {
      const future = new Date(Date.now() + 3600 * 1000);
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: true,
        isRootBanned: false,
      };
      const profile: ProfileAccountStateInput = {
        id: 'p-1',
        isAccountBanned: false,
        suspendedUntil: future,
      };
      const result = service.evaluate(user, profile);
      expect(result.status).toBe('SUSPENDED');
      expect(result.isOperational).toBe(false);
      expect(result.suspendedUntil).toEqual(future);
      expect(service.isOperational(user, profile)).toBe(false);
    });

    it('evaluates past suspendedUntil as operational ACTIVE', () => {
      const past = new Date(Date.now() - 3600 * 1000);
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: true,
        isRootBanned: false,
      };
      const profile: ProfileAccountStateInput = {
        id: 'p-1',
        isAccountBanned: false,
        suspendedUntil: past,
      };
      const result = service.evaluate(user, profile);
      expect(result.status).toBe('ACTIVE');
      expect(result.isOperational).toBe(true);
      expect(service.isOperational(user, profile)).toBe(true);
    });

    it('evaluates scheduled deletion grace period as SCHEDULED_DELETION and non-operational', () => {
      const future = new Date(Date.now() + 86400 * 1000 * 20);
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: false,
        scheduledDeletionAt: future,
      };
      const result = service.evaluate(user);
      expect(result.status).toBe('SCHEDULED_DELETION');
      expect(result.isOperational).toBe(false);
      expect(result.scheduledDeletionAt).toEqual(future);
      expect(service.isOperational(user)).toBe(false);
    });

    it('evaluates regular inactive account as DEACTIVATED and non-operational', () => {
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: false,
      };
      const result = service.evaluate(user);
      expect(result.status).toBe('DEACTIVATED');
      expect(result.isOperational).toBe(false);
      expect(service.isOperational(user)).toBe(false);
    });

    it('evaluates active non-banned non-suspended account as ACTIVE and operational', () => {
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: true,
        isRootBanned: false,
      };
      const profile: ProfileAccountStateInput = {
        id: 'p-1',
        isAccountBanned: false,
        suspendedUntil: null,
      };
      const result = service.evaluate(user, profile);
      expect(result.status).toBe('ACTIVE');
      expect(result.isOperational).toBe(true);
      expect(service.isOperational(user, profile)).toBe(true);
    });
  });

  describe('assertOperational', () => {
    it('does not throw when user and profile are in good operational standing', () => {
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: true,
      };
      expect(() => service.assertOperational(user)).not.toThrow();
    });

    it('throws ACCOUNT_BANNED UnauthorizedException when user is root banned', () => {
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: true,
        isRootBanned: true,
        rootBanReason: 'Fraudulent activity',
      };
      expect(() => service.assertOperational(user)).toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: 'Fraudulent activity',
        }),
      );
    });

    it('throws ACCOUNT_BANNED UnauthorizedException when profile is account banned', () => {
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: true,
      };
      const profile: ProfileAccountStateInput = {
        id: 'p-1',
        isAccountBanned: true,
        accountBanReason: 'Impersonation violation',
      };
      expect(() => service.assertOperational(user, profile)).toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: 'Impersonation violation',
        }),
      );
    });

    it('throws ACCOUNT_SUSPENDED UnauthorizedException when profile is temporarily suspended', () => {
      const future = new Date(Date.now() + 7200 * 1000);
      const user: UserAccountStateInput = {
        id: 'u-1',
        isActive: true,
      };
      const profile: ProfileAccountStateInput = {
        id: 'p-1',
        suspendedUntil: future,
      };
      expect(() => service.assertOperational(user, profile)).toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_SUSPENDED,
          suspendedUntil: future.toISOString(),
        }),
      );
    });

    it('throws deactivated UnauthorizedException when user is inactive or missing', () => {
      expect(() => service.assertOperational(null)).toThrow(
        new UnauthorizedException('User not found or account deactivated'),
      );

      const inactiveUser: UserAccountStateInput = {
        id: 'u-1',
        isActive: false,
      };
      expect(() => service.assertOperational(inactiveUser)).toThrow(
        new UnauthorizedException('User not found or account deactivated'),
      );
    });
  });
});
