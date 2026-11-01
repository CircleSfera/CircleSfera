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

/**
 * Where the bottom of the editor goes. With a panel open it stacks under the
 * canvas. At rest on a phone it is laid over the bottom of the story, as wide
 * as the story: its bottom edge is the top safe area plus the story's height.
 * On desktop it stands under the canvas.
 */
export function getStoryBottomBarClass(panelOpen: boolean): string {
  if (panelOpen) return 'relative shrink-0 w-full';
  return 'absolute inset-x-0 mx-auto w-[min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*9/16))] top-[calc(env(safe-area-inset-top,0px)+min(100vw,calc((100dvh-env(safe-area-inset-top,0px))*9/16))*16/9)] -translate-y-full md:relative md:inset-x-auto md:top-auto md:mx-0 md:w-full md:translate-y-0';
}

/**
 * The share row's own room. Over the story on a phone it sits on a dark
 * gradient, so it reads on any picture; under a panel it takes the panel's
 * surface; on desktop it stands on the brand's background.
 */
export function getStoryShareRowPadClass(panelOpen: boolean): string {
  if (panelOpen) {
    return 'pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] bg-surface-elevated md:bg-transparent md:pb-6';
  }
  return 'pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-linear-to-t from-black/70 via-black/35 to-transparent md:bg-none md:pt-2 md:pb-6';
}
