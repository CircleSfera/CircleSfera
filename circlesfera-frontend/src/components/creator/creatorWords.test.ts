import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { againstAverage, localHour, weekdayName } from './creatorWords';

const t = ((key: string, options?: { value?: number }) =>
  options?.value == null ? key : `${key}:${options.value}`) as TFunction;

describe('againstAverage', () => {
  it('says a score as a distance from the average of the profile', () => {
    expect(againstAverage(111, t)).toBe('creator.post.above_average:11');
    expect(againstAverage(89, t)).toBe('creator.post.below_average:11');
    expect(againstAverage(103, t)).toBe('creator.post.at_average');
  });

  it('says nothing when there is no score', () => {
    expect(againstAverage(undefined, t)).toBe('');
  });
});

describe('weekdayName', () => {
  it('writes the day the server names in Spanish in the language asked', () => {
    expect(weekdayName('Domingos', 'en')).toBe('Sunday');
    expect(weekdayName('Sábados', 'es')).toBe('Sábado');
  });

  it('keeps a word it does not know', () => {
    expect(weekdayName('Someday', 'en')).toBe('Someday');
  });
});

describe('localHour', () => {
  it('writes an hour of universal time as a time of the reader', () => {
    const expected = new Date();
    expected.setUTCHours(17, 0, 0, 0);
    expect(localHour(17, 'en')).toBe(
      expected.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }),
    );
  });
});
