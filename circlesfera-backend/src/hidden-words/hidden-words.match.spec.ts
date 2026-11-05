import { describe, expect, it } from 'vitest';
import {
  containsHiddenWord,
  normalizeHiddenWord,
} from './hidden-words.match.js';

describe('hidden words', () => {
  it('compares without case, accents or extra spaces', () => {
    expect(normalizeHiddenWord('  Pésimo   TRABAJO ')).toBe('pesimo trabajo');
    expect(containsHiddenWord('Qué PÉSIMO trabajo', ['pesimo'])).toBe(true);
  });

  it('matches a word or phrase only whole, never inside another word', () => {
    expect(containsHiddenWord('first class seats', ['ass'])).toBe(false);
    expect(containsHiddenWord('what an ass.', ['ass'])).toBe(true);
    expect(containsHiddenWord('you are  so ugly', ['so ugly'])).toBe(true);
    expect(containsHiddenWord('so uglyish', ['so ugly'])).toBe(false);
  });

  it('matches an emoji or symbol anywhere', () => {
    expect(containsHiddenWord('nice🐍pic', ['🐍'])).toBe(true);
    expect(containsHiddenWord('nice pic', ['🐍'])).toBe(false);
  });

  it('reads a word with symbols in it as written', () => {
    expect(containsHiddenWord('call me (now)', ['(now)'])).toBe(true);
    expect(containsHiddenWord('a+b', ['a+b'])).toBe(true);
  });

  it('hides nothing with no words, no text or an empty word', () => {
    expect(containsHiddenWord('anything', [])).toBe(false);
    expect(containsHiddenWord('', ['x'])).toBe(false);
    expect(containsHiddenWord('anything', [''])).toBe(false);
  });
});
