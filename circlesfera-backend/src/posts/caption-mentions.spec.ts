import { describe, expect, it } from 'vitest';
import { captionMentions } from './caption-mentions.js';

describe('captionMentions', () => {
  it('reads each username once, at the start or after a space', () => {
    expect(captionMentions('@ana hola @bea.x y @ana otra vez')).toEqual([
      'ana',
      'bea.x',
    ]);
  });

  it('takes no e-mail address and nothing from an empty caption', () => {
    expect(captionMentions('escribe a hola@circlesfera.com')).toEqual([]);
    expect(captionMentions('')).toEqual([]);
    expect(captionMentions(null)).toEqual([]);
  });
});
