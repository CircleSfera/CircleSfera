import type { PostShape } from '@circlesfera/shared';

// Tailwind reads class names whole from the source, so the sizes below are
// written out in full and not built from parts. At rest on a phone the story
// is min(100vw, (100dvh - top safe area) * 9/16) wide: the width of the
// screen, unless the screen is shorter than 9:16 under its safe area.

/**
 * Room around the story canvas. Only text mode, whose bars float over the
 * screen, needs room kept here. At rest on a phone the story starts right
 * under the safe area, with the share row floating over its bottom.
 */
export function getStoryStagePadClass(opts: {
  textTakeoverActive: boolean;
}): string {
  if (opts.textTakeoverActive) {
    return 'pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]';
  }
  return 'pt-[env(safe-area-inset-top,0px)] md:pt-6 md:pb-4';
}

/**
 * How the stage that holds the canvas takes the height of the screen.
 * At rest it is as tall as the canvas: on a phone the story sits at the top
 * and the share row floats over its bottom; on desktop the canvas and the row
 * sit together in the middle of the screen. With a panel open or in text mode
 * it takes the free height and the canvas shrinks into it.
 */
export function getStoryStageFitClass(fill: boolean): string {
  return fill ? 'flex-1 min-h-0 [container-type:size]' : 'shrink-0';
}

/**
 * What the editor edits, which sets the shape of its canvas: a story is
 * 9:16; a post is square, portrait 4:5 or landscape 1.91:1.
 */
export type EditorFrame = 'STORY' | PostShape;

/**
 * The canvas in each shape, never distorted. At rest on a phone it is as
 * wide as the screen when the height allows; with a panel open it fits the
 * stage. On desktop a story is at most 600 px tall, and a post at most 600 px
 * tall and 600 px wide. Written out whole, as Tailwind reads them.
 */
const CARD_SIZE: Record<EditorFrame, { fill: string; rest: string }> = {
  STORY: {
    fill: 'aspect-9/16 w-[min(100cqw,calc(100cqh*9/16))] md:w-[min(100cqw,calc(min(100cqh,600px)*9/16))]',
    rest: 'aspect-9/16 w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*9/16))] md:w-[min(337.5px,calc((100dvh-9rem)*9/16))]',
  },
  PORTRAIT: {
    fill: 'aspect-4/5 w-[min(100cqw,calc(100cqh*4/5))] md:w-[min(100cqw,calc(min(100cqh,600px)*4/5))]',
    rest: 'aspect-4/5 w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*4/5))] md:w-[min(480px,calc((100dvh-9rem)*4/5))]',
  },
  SQUARE: {
    fill: 'aspect-square w-[min(100cqw,100cqh)] md:w-[min(100cqw,100cqh,600px)]',
    rest: 'aspect-square w-[min(100vw,calc(100dvh-env(safe-area-inset-top,0px)))] md:w-[min(600px,calc(100dvh-9rem))]',
  },
  LANDSCAPE: {
    fill: 'aspect-[191/100] w-[min(100cqw,calc(100cqh*191/100))] md:w-[min(100cqw,calc(100cqh*191/100),600px)]',
    rest: 'aspect-[191/100] w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*191/100))] md:w-[min(600px,calc((100dvh-9rem)*191/100))]',
  },
};

export function getStoryCardSizeClass(
  fill: boolean,
  frame: EditorFrame = 'STORY',
): string {
  const size = CARD_SIZE[frame];
  return fill ? size.fill : size.rest;
}

/** The editor's screen: a post sits in its middle, a story at its top. */
export function getStoryRootClass(frame: EditorFrame = 'STORY'): string {
  return frame === 'STORY' ? 'md:justify-center' : 'justify-center';
}

/** Height of the share row's buttons, in px. */
export const STORY_SHARE_ROW_PX = 44;
/** Room the share row keeps around it in the band under the story, in px. */
export const STORY_SHARE_ROW_GAP_PX = 12;

/**
 * Whether the share row fits in the band left under the story on a phone,
 * once the bottom safe area is taken out: its height plus 12 px. If it does,
 * it stands in that band; if not, it floats over the bottom of the story.
 */
export function storyShareRowFitsBand(bandPx: number): boolean {
  return bandPx >= STORY_SHARE_ROW_PX + STORY_SHARE_ROW_GAP_PX;
}

/** Where the share row is: under a panel, in the band, or over the story. */
export type StoryShareRowPlace = 'panel' | 'band' | 'over';

/**
 * The bottom of the editor. With a panel open it stacks under the canvas.
 * At rest on a phone it is the band the story leaves at the bottom of the
 * screen, above the bottom safe area; on desktop it stands under the canvas.
 */
export function getStoryBottomBarClass(
  panelOpen: boolean,
  frame: EditorFrame = 'STORY',
): string {
  if (panelOpen) return 'relative shrink-0 w-full';
  // A post is shorter than the screen: it sits in the middle with "Done"
  // under it, instead of leaving a band at the bottom.
  if (frame !== 'STORY') {
    return 'relative w-full shrink-0 pt-3 pb-[env(safe-area-inset-bottom,0px)] md:pt-0 md:pb-0';
  }
  return 'relative w-full flex-1 min-h-0 justify-center pb-[env(safe-area-inset-bottom,0px)] md:flex-none md:pb-0';
}

/**
 * The share row's own place and room. Under a panel it takes the panel's
 * surface. In the band it sits in its middle, with nothing over the story.
 * Over the story it is laid on the story's bottom edge, as wide as the
 * story, on a dark gradient so it reads on any picture. On desktop it stands
 * under the canvas, on the brand's background.
 */
export function getStoryShareRowClass(
  place: StoryShareRowPlace,
  frame: EditorFrame = 'STORY',
): string {
  if (place === 'panel') {
    return 'pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] bg-surface-elevated md:bg-transparent md:pb-6';
  }
  if (place === 'band') return 'md:pt-2 md:pb-6';
  return `absolute inset-x-0 bottom-full mx-auto ${ROW_OVER_WIDTH[frame]} pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-linear-to-t from-black/70 via-black/35 to-transparent md:static md:mx-0 md:w-full md:bg-none md:pt-2 md:pb-6`;
}

/** Over the canvas on a phone, the share row is as wide as the canvas. */
const ROW_OVER_WIDTH: Record<EditorFrame, string> = {
  STORY: 'w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*9/16))]',
  PORTRAIT: 'w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*4/5))]',
  SQUARE: 'w-[min(100vw,calc(100dvh-env(safe-area-inset-top,0px)))]',
  LANDSCAPE:
    'w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*191/100))]',
};
