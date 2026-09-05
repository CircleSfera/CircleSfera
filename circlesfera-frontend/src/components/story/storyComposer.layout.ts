export function getStoryStagePadClass(opts: {
  textTakeoverActive: boolean;
  editingElement: boolean;
  panelOpen: boolean;
}): string {
  const { textTakeoverActive, editingElement, panelOpen } = opts;
  // Mobile: chrome insets only (full-bleed canvas). md+: room for framed card.
  return textTakeoverActive
    ? 'pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pt-20 md:pb-24'
    : editingElement
      ? 'pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(min(34dvh,260px)+env(safe-area-inset-bottom,0px)+0.5rem)] md:pt-20 md:pb-[calc(min(34dvh,260px)+1.25rem)]'
      : panelOpen
        ? 'pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(min(34dvh,260px)+4.75rem+env(safe-area-inset-bottom,0px))] md:pt-20 md:pb-[calc(min(34dvh,260px)+5.75rem)]'
        : 'pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:pt-20 md:pb-28';
}

/**
 * Canvas size classes. Mobile = full-bleed 9:16 in the stage (ADR-0018).
 * md+ = framed floating card.
 */
export function getStoryCardSizeClass(opts: {
  textTakeoverActive: boolean;
  editingElement: boolean;
  panelOpen: boolean;
}): string {
  const { textTakeoverActive, editingElement, panelOpen } = opts;
  return textTakeoverActive
    ? 'h-full max-h-full w-auto max-w-full md:h-auto md:w-[min(260px,calc(min(56dvh,460px)*9/16))]'
    : editingElement
      ? 'h-full max-h-full w-auto max-w-full md:h-auto md:w-[min(240px,calc(min(50dvh,400px)*9/16))]'
      : panelOpen
        ? 'h-full max-h-full w-auto max-w-full md:h-auto md:w-[min(240px,calc(min(50dvh,400px)*9/16))]'
        : 'h-full max-h-full w-auto max-w-full md:h-auto md:w-[min(260px,calc(min(56dvh,460px)*9/16))]';
}
