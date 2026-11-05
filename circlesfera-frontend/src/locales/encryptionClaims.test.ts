import { describe, expect, it } from 'vitest';
import en from './en.json';
import es from './es.json';

// Messages are encrypted on CircleSfera's servers, not end to end: no text
// of the app may tell people otherwise.
const CLAIM = /end[- ]to[- ]end|extremo a extremo|\bE2EE?\b/i;

function claims(node: unknown, path: string[] = []): string[] {
  if (typeof node === 'string') {
    return CLAIM.test(node) ? [path.join('.')] : [];
  }
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) =>
      claims(value, [...path, key]),
    );
  }
  return [];
}

describe('encryption claims', () => {
  it('no text in Spanish or English says the chat is end-to-end encrypted', () => {
    expect(claims(es)).toEqual([]);
    expect(claims(en)).toEqual([]);
  });
});
