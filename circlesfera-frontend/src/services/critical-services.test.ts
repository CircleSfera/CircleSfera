import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each critical service method must call the right HTTP method, path and
// body: a typo here breaks sign-in, payments or moderation silently.
const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('./api', () => ({ apiClient: client }));

import * as appeals from './appeals.service';
import { authApi } from './auth.service';
import { paymentsApi } from './payments.service';
import { profileApi } from './profile.service';
import { reportsApi } from './reports.service';
import { usersApi } from './users.service';

type Verb = keyof typeof client;
type Case = [name: string, call: () => unknown, verb: Verb, args: unknown[]];

const cases: Case[] = [
  // Sign-in and account security
  [
    'auth.register',
    () => authApi.register({ email: 'a' } as never),
    'post',
    ['/auth/register', { email: 'a' }],
  ],
  [
    'auth.login',
    () => authApi.login({ identifier: 'a', password: 'p' }),
    'post',
    ['/auth/login', { identifier: 'a', password: 'p' }],
  ],
  [
    'auth.logout with token',
    () => authApi.logout('rt'),
    'post',
    ['/auth/logout', { refreshToken: 'rt' }],
  ],
  ['auth.logout', () => authApi.logout(), 'post', ['/auth/logout', {}]],
  [
    'auth.verifyEmail',
    () => authApi.verifyEmail('tok'),
    'post',
    ['/auth/verify-email', { token: 'tok' }],
  ],
  [
    'auth.resendVerification',
    () => authApi.resendVerification(),
    'post',
    ['/auth/resend-verification'],
  ],
  [
    'auth.requestReset',
    () => authApi.requestReset('a@b.c'),
    'post',
    ['/auth/request-reset', { email: 'a@b.c' }],
  ],
  [
    'auth.resetPassword',
    () => authApi.resetPassword({ token: 't', newPassword: 'n' }),
    'post',
    ['/auth/reset-password', { token: 't', newPassword: 'n' }],
  ],
  [
    'auth.generate2fa',
    () => authApi.generate2fa(),
    'post',
    ['/auth/2fa/generate'],
  ],
  [
    'auth.verify2fa',
    () => authApi.verify2fa({ code: '1' }),
    'post',
    ['/auth/2fa/verify', { code: '1' }],
  ],
  [
    'auth.enable2fa',
    () => authApi.enable2fa({ code: '1' }),
    'post',
    ['/auth/2fa/enable', { code: '1' }],
  ],
  [
    'auth.disable2fa',
    () => authApi.disable2fa(),
    'post',
    ['/auth/2fa/disable'],
  ],
  ['auth.getSessions', () => authApi.getSessions(), 'get', ['/auth/sessions']],
  [
    'auth.revokeSession',
    () => authApi.revokeSession('s1'),
    'delete',
    ['/auth/sessions/s1'],
  ],
  [
    'auth.revokeOtherSessions',
    () => authApi.revokeOtherSessions(),
    'delete',
    ['/auth/sessions/other'],
  ],
  // Payments
  [
    'payments.getPlans',
    () => paymentsApi.getPlans(),
    'get',
    ['/payments/plans'],
  ],
  [
    'payments.checkout monthly',
    () => paymentsApi.createSubscriptionCheckout('p1'),
    'post',
    ['/payments/checkout', { planId: 'p1', billingCycle: 'MONTHLY' }],
  ],
  [
    'payments.checkout yearly',
    () => paymentsApi.createSubscriptionCheckout('p1', 'YEARLY'),
    'post',
    ['/payments/checkout', { planId: 'p1', billingCycle: 'YEARLY' }],
  ],
  [
    'payments.portal',
    () => paymentsApi.getBillingPortalUrl(),
    'get',
    ['/payments/portal'],
  ],
  [
    'payments.status',
    () => paymentsApi.getBillingStatus(),
    'get',
    ['/payments/status'],
  ],
  [
    'payments.ledger',
    () => paymentsApi.getLedger(),
    'get',
    ['/payments/ledger', { responseType: 'blob' }],
  ],
  [
    'payments.adminLedger',
    () => paymentsApi.getAdminLedger(),
    'get',
    ['/payments/admin/ledger', { responseType: 'blob' }],
  ],
  // Moderation: reports and appeals
  [
    'reports.create',
    () =>
      reportsApi.create({ targetType: 'POST', targetId: 'p', reason: 'SPAM' }),
    'post',
    ['reports', { targetType: 'POST', targetId: 'p', reason: 'SPAM' }],
  ],
  ['reports.getMine', () => reportsApi.getMine(), 'get', ['reports/me']],
  ['reports.getAll', () => reportsApi.getAll(), 'get', ['reports']],
  [
    'reports.update',
    () => reportsApi.update('r1', 'RESOLVED'),
    'patch',
    ['reports/r1', { status: 'RESOLVED' }],
  ],
  [
    'appeals.create',
    () =>
      appeals.createAppeal({
        targetType: 'STRIKE',
        targetId: 's',
        reason: 'x',
      } as never),
    'post',
    ['/appeals', { targetType: 'STRIKE', targetId: 's', reason: 'x' }],
  ],
  [
    'appeals.mine',
    () => appeals.getMyAppeals(),
    'get',
    ['/appeals/my-appeals'],
  ],
  [
    'appeals.admin',
    () => appeals.getAdminAppeals(2, 10, 'PENDING'),
    'get',
    ['/appeals/admin', { params: { page: 2, limit: 10, status: 'PENDING' } }],
  ],
  [
    'appeals.admin defaults',
    () => appeals.getAdminAppeals(),
    'get',
    ['/appeals/admin', { params: { page: 1, limit: 20, status: undefined } }],
  ],
  [
    'appeals.update',
    () => appeals.updateAdminAppeal('a1', { status: 'APPROVED' } as never),
    'patch',
    ['/appeals/admin/a1', { status: 'APPROVED' }],
  ],
  ['strikes.mine', () => appeals.getMyStrikes(), 'get', ['/strikes/me']],
  // Account and profiles
  [
    'users.suggestions',
    () => usersApi.getSuggestions(),
    'get',
    ['/users/suggestions', { params: { limit: 10 } }],
  ],
  ['users.ban', () => usersApi.ban('u1'), 'patch', ['/users/u1/ban']],
  ['users.unban', () => usersApi.unban('u1'), 'patch', ['/users/u1/unban']],
  [
    'users.requestExport',
    () => usersApi.requestExport(),
    'get',
    ['/users/gdpr/export'],
  ],
  [
    'users.exportHistory',
    () => usersApi.getExportHistory(),
    'get',
    ['/users/gdpr/exports'],
  ],
  [
    'users.identitySession',
    () => usersApi.createIdentitySession('https://x'),
    'post',
    ['/users/identity-session', { returnUrl: 'https://x' }],
  ],
  [
    'users.syncIdentity',
    () => usersApi.syncIdentitySession(),
    'post',
    ['/users/identity-session/sync'],
  ],
  [
    'users.getSettings',
    () => usersApi.getSettings(),
    'get',
    ['/users/me/settings'],
  ],
  [
    'users.updateSettings',
    () => usersApi.updateSettings({ pushNotifications: false }),
    'put',
    ['/users/me/settings', { pushNotifications: false }],
  ],
  [
    'users.scheduleDeletion',
    () => usersApi.scheduleDeletion(),
    'delete',
    ['/users/me'],
  ],
  [
    'users.cancelDeletion',
    () => usersApi.cancelScheduledDeletion(),
    'post',
    ['/users/me/restore'],
  ],
  ['profile.me', () => profileApi.getMyProfile(), 'get', ['profiles/me']],
  [
    'profile.referrals',
    () => profileApi.getMyReferrals(),
    'get',
    ['profiles/me/referrals'],
  ],
  ['profile.get', () => profileApi.getProfile('ana'), 'get', ['/profiles/ana']],
  [
    'profile.checkUsername',
    () => profileApi.checkUsername('ana'),
    'get',
    ['/profiles/check-username/ana'],
  ],
  [
    'profile.update',
    () => profileApi.updateProfile({ bio: 'b' } as never),
    'put',
    ['/profiles/me', { bio: 'b' }],
  ],
  [
    'profile.mine',
    () => profileApi.getMyProfiles(),
    'get',
    ['/profiles/my-profiles'],
  ],
  [
    'profile.create',
    () => profileApi.createProfile({ username: 'ana2' }),
    'post',
    ['/profiles', { username: 'ana2' }],
  ],
  [
    'profile.switch',
    () => profileApi.switchProfile('p2'),
    'post',
    ['/profiles/switch/p2'],
  ],
  [
    'profile.deactivate',
    () => profileApi.deactivateAccount(),
    'post',
    ['/profiles/me/deactivate'],
  ],
  [
    'profile.delete',
    () => profileApi.deleteAccount(),
    'delete',
    ['/profiles/me'],
  ],
];

describe('critical services', () => {
  beforeEach(() => {
    for (const fn of Object.values(client)) {
      fn.mockReset().mockResolvedValue({ data: 'payload' });
    }
  });

  it.each(cases)('%s', async (_name, call, verb, args) => {
    await call();
    expect(client[verb]).toHaveBeenCalledWith(...args);
    for (const [other, fn] of Object.entries(client)) {
      if (other !== verb) expect(fn).not.toHaveBeenCalled();
    }
  });

  it('services that unwrap the response return its data', async () => {
    await expect(paymentsApi.getPlans()).resolves.toBe('payload');
    await expect(appeals.getMyAppeals()).resolves.toBe('payload');
    await expect(usersApi.createIdentitySession('x')).resolves.toBe('payload');
  });
});
