import { describe, expect, it } from 'vitest';
import {
  CREATOR_NAV_ITEMS,
  CREATOR_TAB_IDS,
  isCreatorTab,
} from '../creator/creatorNav';

describe('creatorNav', () => {
  it('exposes canonical tabs without finance', () => {
    expect(CREATOR_TAB_IDS).toEqual([
      'overview',
      'analytics',
      'monetization',
      'ads',
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
    expect(isCreatorTab('unknown')).toBe(false);
  });
});
