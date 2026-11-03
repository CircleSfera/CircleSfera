import { describe, expect, it } from 'vitest';
import { completeToken, tokenAt } from './captionToken';

describe('the mention or hashtag being written', () => {
  it('is the word with @ or # right before the cursor', () => {
    expect(tokenAt('Hola @an', 8)).toEqual({
      kind: 'mention',
      query: 'an',
      start: 5,
    });
    expect(tokenAt('#mar', 4)).toEqual({
      kind: 'hashtag',
      query: 'mar',
      start: 0,
    });
    expect(tokenAt('Día de #playa_2', 15)?.query).toBe('playa_2');
  });

  it('is none inside a word, after a space, or for an e-mail address', () => {
    expect(tokenAt('Hola @ana ', 10)).toBeNull();
    expect(tokenAt('ana@mail', 8)).toBeNull();
    expect(tokenAt('Hola', 4)).toBeNull();
  });

  it('is replaced by the one chosen, with a space, and the cursor after it', () => {
    const text = 'Con @an y más';
    const token = tokenAt(text, 7);
    if (!token) throw new Error('no token');
    expect(completeToken(text, token, 7, 'ana')).toEqual({
      text: 'Con @ana y más',
      cursor: 9,
    });
  });

  it('takes the rest of a word the cursor was in the middle of', () => {
    const text = 'Ver #pla y';
    const token = tokenAt(text, 6);
    if (!token) throw new Error('no token');
    expect(completeToken(text, token, 6, 'playa').text).toBe('Ver #playa y');
  });
});
