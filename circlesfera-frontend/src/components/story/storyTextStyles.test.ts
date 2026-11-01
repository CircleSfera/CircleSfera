import { describe, expect, it } from 'vitest';
import type { StoryElement } from '../../types';
import {
  getStoryBottomBarClass,
  getStoryCardSizeClass,
  getStoryShareRowPadClass,
  getStoryStageFitClass,
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
  const restWidth =
    'min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*9/16))';

  it('lays the row over the bottom of the story at rest on a phone, as wide as the story', () => {
    const bar = getStoryBottomBarClass(false).split(' ');

    expect(bar).toContain('absolute');
    expect(bar).toContain(`w-[${restWidth}]`);
    // Its bottom edge is where the story ends: top safe area + 16/9 of its width.
    expect(bar).toContain(
      `top-[calc(env(safe-area-inset-top,0px)+${restWidth}*16/9)]`,
    );
    expect(bar).toContain('-translate-y-full');
    // The width is the one the canvas takes at rest.
    expect(getStoryCardSizeClass(false).split(' ')).toContain(
      `w-[${restWidth}]`,
    );
  });

  it('stands the row under the canvas on desktop and under an open panel', () => {
    const bar = getStoryBottomBarClass(false).split(' ');
    expect(bar).toContain('md:relative');
    expect(bar).toContain('md:translate-y-0');

    expect(getStoryBottomBarClass(true)).toBe('relative shrink-0 w-full');
  });

  it('gives the row over the story a dark gradient, and none on desktop or under a panel', () => {
    const over = getStoryShareRowPadClass(false);
    expect(over).toContain('bg-linear-to-t');
    expect(over).toContain('from-black/70');
    expect(over).toContain('md:bg-none');

    expect(getStoryShareRowPadClass(true)).not.toContain('bg-linear-to-t');
  });
});
