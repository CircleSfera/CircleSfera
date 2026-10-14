import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { storyColorName } from './storyColorNames';

const t = i18n.getFixedT('es') as TFunction;

describe('storyColorName', () => {
  it('names an offered colour, whatever the case of its code', () => {
    expect(storyColorName(t, '#FF3B30')).toBe('Rojo');
    expect(storyColorName(t, '#884cff')).toBe('Violeta');
  });

  it('falls back to the code of a colour it has no name for', () => {
    expect(storyColorName(t, '#123456')).toBe('#123456');
  });
});
