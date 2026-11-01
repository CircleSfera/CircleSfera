import { describe, expect, it } from 'vitest';
import type { StoryElement } from '../../types';
import {
  getStoryBottomBarClass,
  getStoryCardSizeClass,
  getStoryShareRowClass,
  getStoryStageFitClass,
  getStoryStagePadClass,
  storyShareRowFitsBand,
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
  it('keeps room for the floating bars of text mode only', () => {
    const idle = getStoryStagePadClass({ textTakeoverActive: false });
    const text = getStoryStagePadClass({ textTakeoverActive: true });

    expect(text).not.toBe(idle);
    expect(text).toContain('pt-[calc(4rem');
    expect(text).toContain('pb-[calc(4.25rem');
  });

  it('starts the story right under the safe area of a phone, with no room above it', () => {
    const idle = getStoryStagePadClass({ textTakeoverActive: false });

    expect(idle.split(' ')).toContain('pt-[env(safe-area-inset-top,0px)]');
    expect(idle).not.toContain('0.5rem');
  });

  it('sizes the canvas 9:16: at rest the width of a phone, with a panel from the free height, at most 600 px tall on desktop', () => {
    const rest = getStoryCardSizeClass(false);
    const fill = getStoryCardSizeClass(true);
    for (const size of [rest, fill]) {
      expect(size).toContain('aspect-9/16');
    }
    // No room is kept under the story for the share row: it floats over it.
    expect(rest).toContain(
      'w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*9/16))]',
    );
    // 600 px tall on desktop: 337.5 px wide.
    expect(rest).toContain('md:w-[min(337.5px');
    expect(fill).toContain('min(100cqh,600px)');
    expect(fill).toContain('w-[min(100cqw,calc(100cqh*9/16))]');
  });

  it('lets the stage take the free height only with a panel or text mode', () => {
    expect(getStoryStageFitClass(true)).toContain('flex-1');
    expect(getStoryStageFitClass(false)).toBe('shrink-0');
  });
});

describe('story share row', () => {
  it('stands the row in the band under the story only when the band holds it and 12 px more', () => {
    // 44 px of buttons and 12 px of room.
    expect(storyShareRowFitsBand(56)).toBe(true);
    expect(storyShareRowFitsBand(150)).toBe(true);
    expect(storyShareRowFitsBand(55)).toBe(false);
    expect(storyShareRowFitsBand(44)).toBe(false);
    expect(storyShareRowFitsBand(0)).toBe(false);
  });

  it('lays the row over the bottom of the story when the band is too small, as wide as the story', () => {
    const over = getStoryShareRowClass('over').split(' ');
    const restWidth =
      'w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*9/16))]';

    expect(over).toContain('absolute');
    // The band starts where the story ends: the row's bottom is that edge.
    expect(over).toContain('bottom-full');
    expect(over).toContain(restWidth);
    expect(getStoryCardSizeClass(false).split(' ')).toContain(restWidth);
    expect(over).toContain('bg-linear-to-t');
    expect(over).toContain('md:static');
    expect(over).toContain('md:bg-none');
  });

  it('puts nothing over the story when the row stands in the band or under a panel', () => {
    for (const place of ['band', 'panel'] as const) {
      const row = getStoryShareRowClass(place);
      expect(row).not.toContain('absolute');
      expect(row).not.toContain('bg-linear-to-t');
    }
  });

  it('makes the bottom of the editor the band under the story at rest, above the safe area', () => {
    const band = getStoryBottomBarClass(false).split(' ');
    expect(band).toContain('flex-1');
    expect(band).toContain('pb-[env(safe-area-inset-bottom,0px)]');
    expect(band).toContain('md:flex-none');

    expect(getStoryBottomBarClass(true)).toBe('relative shrink-0 w-full');
  });
});
