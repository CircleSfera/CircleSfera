import { describe, expect, it } from 'vitest';
import { asList } from './asList';

describe('asList', () => {
  it('keeps a list as it is', () => {
    const list = [1, 2];
    expect(asList<number>(list)).toBe(list);
  });

  it('turns anything else into an empty list', () => {
    for (const wrong of [undefined, null, {}, { data: [1] }, 'text', 3]) {
      expect(asList(wrong)).toEqual([]);
    }
  });
});
