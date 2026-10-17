import { describe, expect, it } from 'vitest';
import { refuseMemberPrice } from './member-price.js';

describe('refuseMemberPrice', () => {
  it('a team member publishes free content only', () => {
    expect(() => refuseMemberPrice({ memberRole: 'EDITOR' }, 500)).toThrow(
      expect.objectContaining({ errorCode: 'TEAM_MEMBER_NOT_ALLOWED' }),
    );
    for (const price of [0, null, undefined]) {
      expect(() =>
        refuseMemberPrice({ memberRole: 'ADMINISTRATOR' }, price),
      ).not.toThrow();
    }
  });

  it('the owner sets any price', () => {
    expect(() => refuseMemberPrice({}, 999)).not.toThrow();
  });
});
