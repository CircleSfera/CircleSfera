import { describe, expect, it } from 'vitest';
import {
  ADMIN_TAB_PERMISSIONS,
  canOpenSite,
  getAdminHomeTab,
  isAdminTab,
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
      'support',
      'plans',
      'promotions',
      'payouts',
      'monetization',
      'newsletter',
    ]);
  });

  it('keeps every other section in the Admin Panel, and none in both', () => {
    expect(admin).toContain('trust');
    expect(admin).toContain('reports');
    expect(admin).toContain('users');
    expect(admin.filter((tab) => backoffice.includes(tab))).toEqual([]);
    for (const tab of backoffice) expect(tabSite(tab)).toBe('backoffice');
    for (const tab of admin) expect(tabSite(tab)).toBe('admin');
  });

  it('opens the Backoffice on the first section the operator may see', () => {
    expect(getAdminHomeTab((key) => key === 'payments', 'backoffice')).toBe(
      'payouts',
    );
    expect(getAdminHomeTab(() => true, 'backoffice')).toBe('support');
  });

  it('knows when an operator has nothing to open in a site', () => {
    const financeOnly = (key: string) => key === 'payments';
    expect(canOpenSite(financeOnly, 'backoffice')).toBe(true);
    expect(canOpenSite(financeOnly, 'admin')).toBe(false);
    expect(canOpenSite(() => false, 'backoffice')).toBe(false);
  });
});
