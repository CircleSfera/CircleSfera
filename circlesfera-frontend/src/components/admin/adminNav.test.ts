import { describe, expect, it } from 'vitest';
import { ADMIN_TAB_PERMISSIONS, getAdminHomeTab, isAdminTab } from './adminNav';

describe('adminNav permissions', () => {
  it('maps promotions to content permission (API aligned)', () => {
    expect(ADMIN_TAB_PERMISSIONS.promotions).toBe('content');
  });

  it('returns trust home when reports permission is present', () => {
    expect(getAdminHomeTab((key) => key === 'reports')).toBe('trust');
  });

  it('falls back to first permitted tab', () => {
    expect(getAdminHomeTab((key) => key === 'support')).toBe('support');
  });

  it('validates admin tab ids', () => {
    expect(isAdminTab('reports')).toBe(true);
    expect(isAdminTab('not-a-tab')).toBe(false);
  });
});
