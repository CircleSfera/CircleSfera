import { describe, expect, it } from 'vitest';
import {
  ADMIN_TAB_PERMISSIONS,
  canOpenSite,
  canOpenTab,
  getAdminHomeTab,
  isAdminTab,
  navGroupsFor,
  navItemsFor,
  tabSite,
} from './adminNav';

describe('adminNav permissions', () => {
  it('maps promotions to content permission (API aligned)', () => {
    expect(ADMIN_TAB_PERMISSIONS.promotions).toBe('content');
  });

  it('returns trust home when reports permission is present', () => {
    expect(getAdminHomeTab((key) => key === 'reports', 'admin')).toBe('trust');
  });

  it('falls back to first permitted tab', () => {
    expect(getAdminHomeTab((key) => key === 'audit', 'admin')).toBe('audit');
  });

  it('validates admin tab ids', () => {
    expect(isAdminTab('reports')).toBe(true);
    expect(isAdminTab('not-a-tab')).toBe(false);
  });
});

describe('the two staff sites', () => {
  const backoffice = navItemsFor('backoffice').map((item) => item.id);
  const admin = navItemsFor('admin').map((item) => item.id);

  it('puts the business sections in the Backoffice', () => {
    expect(backoffice).toEqual([
      'overview',
      'support',
      'help-centre',
      'plans',
      'subscriptions',
      'disputes',
      'promotions',
      'payouts',
      'monetization',
      'newsletter',
    ]);
  });

  it('keeps the queues of moderation work together, after Users', () => {
    const groups = navGroupsFor('admin');
    const idsOf = (labelKey: string) =>
      groups
        .find((group) => group.labelKey === labelKey)
        ?.items.map((item) => item.id) ?? [];

    // Notices of illegal content from the public sit with the reports.
    expect(idsOf('admin.nav.moderation').slice(0, 5)).toEqual([
      'users',
      'reports',
      'illegal-notices',
      'appeals',
      'spam-review',
    ]);
    expect(idsOf('admin.nav.system')).not.toContain('reports');
    expect(idsOf('admin.nav.system')).not.toContain('appeals');
    expect(idsOf('admin.nav.system')).not.toContain('spam-review');
  });

  it('keeps every other section in the Admin Panel, and none in both', () => {
    expect(admin).toContain('trust');
    expect(admin).toContain('reports');
    expect(admin).toContain('users');
    expect(admin.filter((tab) => backoffice.includes(tab))).toEqual([]);
    for (const tab of backoffice) expect(tabSite(tab)).toBe('backoffice');
    for (const tab of admin) expect(tabSite(tab)).toBe('admin');
  });

  it('opens the Backoffice on its home for whoever can open a section', () => {
    expect(getAdminHomeTab((key) => key === 'payments', 'backoffice')).toBe(
      'overview',
    );
    expect(getAdminHomeTab(() => true, 'backoffice')).toBe('overview');
  });

  it('opens the home with any Backoffice permission and no other', () => {
    expect(canOpenTab((key) => key === 'support', 'overview')).toBe(true);
    expect(canOpenTab((key) => key === 'plans', 'overview')).toBe(true);
    expect(canOpenTab((key) => key === 'moderation', 'overview')).toBe(false);
    expect(canOpenTab(() => false, 'overview')).toBe(false);
  });

  it('opens any other section only with its own permission', () => {
    expect(canOpenTab((key) => key === 'payments', 'subscriptions')).toBe(true);
    expect(canOpenTab((key) => key === 'support', 'subscriptions')).toBe(false);
    // Writing the help centre is for who leads support, not for every agent.
    expect(canOpenTab((key) => key === 'support', 'help-centre')).toBe(false);
    expect(canOpenTab((key) => key === 'support.manage', 'help-centre')).toBe(
      true,
    );
  });

  it('knows when an operator has nothing to open in a site', () => {
    const financeOnly = (key: string) => key === 'payments';
    expect(canOpenSite(financeOnly, 'backoffice')).toBe(true);
    expect(canOpenSite(financeOnly, 'admin')).toBe(false);
    expect(canOpenSite(() => false, 'backoffice')).toBe(false);
  });
});
