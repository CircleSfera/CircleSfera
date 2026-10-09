import { describe, expect, it } from 'vitest';
import { hasCreatorTools } from './creatorTools';

describe('hasCreatorTools', () => {
  it('is true for creator and business accounts', () => {
    expect(hasCreatorTools('CREATOR')).toBe(true);
    expect(hasCreatorTools('BUSINESS')).toBe(true);
  });

  it('is false for a personal account and for an unknown one', () => {
    expect(hasCreatorTools('PERSONAL')).toBe(false);
    expect(hasCreatorTools(undefined)).toBe(false);
    expect(hasCreatorTools(null)).toBe(false);
  });
});
