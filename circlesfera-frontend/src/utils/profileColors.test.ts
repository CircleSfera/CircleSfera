import { describe, expect, it } from 'vitest';
import {
  PROFILE_COLOR_KEYS,
  PROFILE_COLORS,
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

  it('draws over each colour in a tone that can be told apart from it', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((at) => {
        const part = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
        return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (light + 0.05) / (dark + 0.05);
    };

    for (const key of PROFILE_COLOR_KEYS) {
      const { hex, on } = PROFILE_COLORS[key];
      // The minimum for an icon or a control against what is behind it.
      expect(contrast(hex, on), key).toBeGreaterThanOrEqual(3);
      expect(profileColorStyle(key)).toMatchObject({
        '--on-brand-primary': on,
      });
    }
    // White is kept where it reads; the light colours get the dark tone.
    expect(PROFILE_COLORS.blue.on).toBe('#ffffff');
    expect(PROFILE_COLORS.silver.on).toBe('#0a0a0a');
  });
});
