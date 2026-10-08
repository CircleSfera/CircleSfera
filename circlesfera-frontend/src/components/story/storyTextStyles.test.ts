import { describe, expect, it } from 'vitest';
import type { StoryElement } from '../../types';
import {
  getStoryCardSizeClass,
  getStoryStagePadClass,
} from './storyComposer.layout';
import { getTextStyleCSS, neonTextShadow } from './storyTextStyles';

const text = (over: Partial<StoryElement> = {}): StoryElement => ({
  id: 't',
  type: 'text',
  content: 'Hola',
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  color: '#FF0000',
  ...over,
});

describe('story text look', () => {
  it('uses the default font, size and alignment when the text has none', () => {
    const css = getTextStyleCSS(text());

    expect(css).toMatchObject({
      color: '#FF0000',
      fontFamily: '"Outfit", sans-serif',
      fontSize: '24px',
      letterSpacing: 'normal',
      textAlign: 'center',
      width: 'auto',
      maxWidth: '90%',
      opacity: 1,
    });
  });

  it('uses the font, size, spacing, width, alignment and opacity of the text', () => {
    const css = getTextStyleCSS(
      text({
        fontFamily: 'Playfair Display',
        fontSize: 40,
        letterSpacing: 2,
        width: 200,
        align: 'left',
        opacity: 0.5,
      }),
    );

    expect(css).toMatchObject({
      fontFamily: '"Playfair Display", sans-serif',
      fontSize: '40px',
      letterSpacing: '2px',
      width: '200px',
      maxWidth: '200px',
      textAlign: 'left',
      opacity: 0.5,
    });
  });

  it('makes a boxed text as wide as its words unless a width is set', () => {
    expect(getTextStyleCSS(text({ textStyle: 'box' }))).toMatchObject({
      width: 'fit-content',
      minWidth: 'min-content',
    });
    expect(
      getTextStyleCSS(text({ textStyle: 'box-shadow', width: 180 })).width,
    ).toBe('180px');
  });

  it('paints a gradient through the letters', () => {
    const css = getTextStyleCSS(
      text({ gradientColors: ['#111111', '#222222'] }),
    );

    expect(css.background).toBe('linear-gradient(135deg, #111111, #222222)');
    expect(css.backgroundClip).toBe('text');
    expect(css.color).toBe('transparent');
    expect(css.textShadow).toBeUndefined();
  });

  it('gives neon text a glow in its own colour', () => {
    const css = getTextStyleCSS(text({ textStyle: 'neon' }));

    expect(css.fontWeight).toBe(700);
    expect(css.textShadow).toBe(neonTextShadow('#FF0000'));
    expect(css.color).toBe('#FF0000');
  });

  it('gives white neon text a tinted glow so it stays readable', () => {
    for (const white of ['#FFFFFF', '#fff', 'white', '#F5F5F5']) {
      expect(neonTextShadow(white)).toContain('#c4b5fd');
    }
    expect(neonTextShadow('#FF0000')).not.toContain('#c4b5fd');
    expect(neonTextShadow('rgb(255,255,255)')).not.toContain('#c4b5fd');
  });

  it('draws outlined text as a stroke with no fill', () => {
    const css = getTextStyleCSS(text({ textStyle: 'outline' }));

    expect(css.WebkitTextStroke).toBe('1.5px #FF0000');
    expect(css.color).toBe('transparent');
  });

  it('gives the shadow, retro and classic looks a different shadow each', () => {
    const shadows = (['shadow', 'retro', 'classic'] as const).map(
      (textStyle) => getTextStyleCSS(text({ textStyle })).textShadow,
    );

    expect(new Set(shadows).size).toBe(3);
    expect(shadows.every(Boolean)).toBe(true);
  });
});

describe('story stage space', () => {
  const pad = (over: Partial<Parameters<typeof getStoryStagePadClass>[0]>) =>
    getStoryStagePadClass({
      textTakeoverActive: false,
      editingElement: false,
      panelOpen: false,
      ...over,
    });

  it('leaves a different room under the story for each state of the editor', () => {
    const all = [
      pad({}),
      pad({ panelOpen: true }),
      pad({ editingElement: true }),
      pad({ textTakeoverActive: true }),
    ];

    expect(new Set(all).size).toBe(4);
  });

  it('gives text mode priority over an open panel, and editing over the tool panel', () => {
    expect(pad({ textTakeoverActive: true, panelOpen: true })).toBe(
      pad({ textTakeoverActive: true }),
    );
    expect(pad({ editingElement: true, panelOpen: true })).toBe(
      pad({ editingElement: true }),
    );
  });

  it('keeps the story card inside the screen height', () => {
    expect(getStoryCardSizeClass()).toContain('max-h-[65dvh]');
  });
});
