import { describe, expect, it } from 'vitest';
import {
  CREATOR_NAV_ITEMS,
  CREATOR_TAB_IDS,
  isCreatorTab,
  visibleNavItems,
} from '../creator/creatorNav';

describe('creatorNav', () => {
  it('exposes canonical tabs without finance', () => {
    expect(CREATOR_TAB_IDS).toEqual([
      'overview',
      'analytics',
      'business',
      'plans',
      'ads',
      'founders',
      'content',
      'stories',
    ]);
    expect(CREATOR_NAV_ITEMS.some((i) => (i.id as string) === 'finance')).toBe(
      false,
    );
  });

  it('validates creator tab ids', () => {
    expect(isCreatorTab('overview')).toBe(true);
    expect(isCreatorTab('finance')).toBe(false);
    expect(isCreatorTab('monetization')).toBe(false);
    expect(isCreatorTab('unknown')).toBe(false);
  });

  it('shows the business tab to a Business Profile only', () => {
    const ids = (type: string | undefined) =>
      visibleNavItems(CREATOR_NAV_ITEMS, type).map((i) => i.id);
    expect(ids('BUSINESS')).toContain('business');
    expect(ids('CREATOR')).not.toContain('business');
    expect(ids(undefined)).not.toContain('business');
    expect(ids('CREATOR')).toContain('analytics');
  });

  it('shows the founding creators tab to a Creator Profile only (BD-034)', () => {
    const ids = (type: string | undefined) =>
      visibleNavItems(CREATOR_NAV_ITEMS, type).map((i) => i.id);
    expect(ids('CREATOR')).toContain('founders');
    expect(ids('BUSINESS')).not.toContain('founders');
    expect(ids('PERSONAL')).not.toContain('founders');
    expect(ids(undefined)).not.toContain('founders');
  });
});
