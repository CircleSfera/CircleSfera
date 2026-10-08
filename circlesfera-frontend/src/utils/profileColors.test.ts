import { describe, expect, it } from 'vitest';
import {
  PROFILE_COLOR_KEYS,
  profileColor,
  profileColorStyle,
} from './profileColors';

describe('profile colours', () => {
  it('offers the seven colours of the closed list, without coral or red', () => {
    expect(PROFILE_COLOR_KEYS).toEqual([
      'blue',
      'cyan',
      'teal',
      'green',
      'amber',
      'pink',
      'silver',
    ]);
  });

  it.each([null, undefined, '', 'coral', '#ff5757'])(
    'keeps the colours of the app for %s',
    (key) => {
      expect(profileColor(key)).toBeNull();
      expect(profileColorStyle(key)).toBeUndefined();
    },
  );

  it('replaces the brand colours with the chosen one', () => {
    expect(profileColorStyle('teal')).toMatchObject({
      '--brand-primary': '#14b8a6',
      '--brand-primary-rgb': '20, 184, 166',
      '--color-brand-primary': '#14b8a6',
    });
  });
});
