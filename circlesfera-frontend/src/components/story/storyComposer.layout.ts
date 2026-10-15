/**
 * Room around the story canvas. The canvas is sized from the space its stage
 * leaves (see `getStoryCardSizeClass`), and the bottom of the editor (the
 * share row or an open panel) takes its own place under the stage, so only
 * text mode, whose bars float over the screen, needs room kept here.
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
 * The canvas is 9:16 and as large as the stage allows: as wide as a phone
 * when the height is there, narrower when it is not, and never distorted. On
 * desktop it is at most 600 px tall. Sized with the stage's container units.
 */
export function getStoryCardSizeClass(): string {
  return 'aspect-9/16 w-[min(100cqw,calc(100cqh*9/16))] md:w-[min(100cqw,calc(min(100cqh,600px)*9/16))]';
}
