/**
 * Room around the story canvas. Only text mode, whose bars float over the
 * screen, needs room kept here; the bottom of the editor takes its own place.
 */
export function getStoryStagePadClass(opts: {
  textTakeoverActive: boolean;
}): string {
  if (opts.textTakeoverActive) {
    return 'pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]';
  }
  return 'pt-[calc(0.5rem+env(safe-area-inset-top,0px))] pb-2 md:pt-6 md:pb-4';
}

/**
 * How the stage that holds the canvas takes the height of the screen.
 * At rest on a phone it is as tall as the canvas, so the share row sits in
 * the middle of what is left under it, as on Instagram; on desktop the canvas
 * and the row sit together in the middle of the screen. With a panel open or
 * in text mode it takes the free height and the canvas shrinks into it.
 */
export function getStoryStageFitClass(fill: boolean): string {
  return fill ? 'flex-1 min-h-0 [container-type:size]' : 'shrink-0';
}

/**
 * The canvas is 9:16 and never distorted. At rest on a phone it is as wide as
 * the screen when the height allows, keeping at least 6.5rem for the share
 * row; with a panel open it fits the stage. On desktop it is at most 600 px
 * tall.
 */
export function getStoryCardSizeClass(fill: boolean): string {
  if (fill) {
    return 'aspect-9/16 w-[min(100cqw,calc(100cqh*9/16))] md:w-[min(100cqw,calc(min(100cqh,600px)*9/16))]';
  }
  return 'aspect-9/16 w-[min(100vw,calc((100dvh-6.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))*9/16))] md:w-[min(337.5px,calc((100dvh-9rem)*9/16))]';
}
