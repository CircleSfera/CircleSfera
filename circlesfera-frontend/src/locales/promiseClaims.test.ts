import { describe, expect, it } from 'vitest';
import en from './en.json';
import es from './es.json';

// CircleSfera's promise is "Siempre sabes por qué lo ves" / "You always know
// why you see it" (BD-037). With advertising chosen by the Pixel or by
// audiences (PD-084), not everything shown is the person's choice, so no text
// of the app may promise that the person decides what they see.
const OLD_PROMISE =
  /you decide what you see|decides? (qué|lo que) ves|tú decides qué ves/i;

function claims(node: unknown, path: string[] = []): string[] {
  if (typeof node === 'string') {
    return OLD_PROMISE.test(node) ? [path.join('.')] : [];
  }
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) =>
      claims(value, [...path, key]),
    );
  }
  return [];
}

describe('the promise of CircleSfera (BD-037)', () => {
  it('no text in Spanish or English promises that the person decides what they see', () => {
    expect(claims(es)).toEqual([]);
    expect(claims(en)).toEqual([]);
  });

  it('the landing says the promise in both languages', () => {
    expect(es.landing.hero.subtitle).toContain(
      'siempre sabes por qué ves lo que ves',
    );
    expect(en.landing.hero.subtitle).toContain(
      'you always know why you see what you see',
    );
  });
});
