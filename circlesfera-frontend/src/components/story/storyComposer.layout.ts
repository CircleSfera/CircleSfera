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
 * The canvas is 9:16 and never distorted. At rest on a phone it is as wide as
 * the screen when the height allows; with a panel open it fits the stage. On
 * desktop it is at most 600 px tall.
 */
export function getStoryCardSizeClass(fill: boolean): string {
  if (fill) {
    return 'aspect-9/16 w-[min(100cqw,calc(100cqh*9/16))] md:w-[min(100cqw,calc(min(100cqh,600px)*9/16))]';
  }
  return 'aspect-9/16 w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*9/16))] md:w-[min(337.5px,calc((100dvh-9rem)*9/16))]';
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
export function getStoryBottomBarClass(panelOpen: boolean): string {
  if (panelOpen) return 'relative shrink-0 w-full';
  return 'relative w-full flex-1 min-h-0 justify-center pb-[env(safe-area-inset-bottom,0px)] md:flex-none md:pb-0';
}

/**
 * The share row's own place and room. Under a panel it takes the panel's
 * surface. In the band it sits in its middle, with nothing over the story.
 * Over the story it is laid on the story's bottom edge, as wide as the
 * story, on a dark gradient so it reads on any picture. On desktop it stands
 * under the canvas, on the brand's background.
 */
export function getStoryShareRowClass(place: StoryShareRowPlace): string {
  if (place === 'panel') {
    return 'pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] bg-surface-elevated md:bg-transparent md:pb-6';
  }
  if (place === 'band') return 'md:pt-2 md:pb-6';
  return 'absolute inset-x-0 bottom-full mx-auto w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*9/16))] pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-linear-to-t from-black/70 via-black/35 to-transparent md:static md:mx-0 md:w-full md:bg-none md:pt-2 md:pb-6';
}
