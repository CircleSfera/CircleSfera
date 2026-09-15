export function getStoryStagePadClass(opts: {
  textTakeoverActive: boolean;
  editingElement: boolean;
  panelOpen: boolean;
}): string {
  const { textTakeoverActive, editingElement, panelOpen } = opts;
  // Dynamic padding shrinks the flex container's available height
  // when panels open, forcing the card to smoothly scale down and center itself in the remaining space.
  if (textTakeoverActive) {
    return 'pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]';
  }
  if (editingElement) {
    return 'pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(min(34dvh,260px)+env(safe-area-inset-bottom,0px)+0.5rem)]';
  }
  if (panelOpen) {
    // El panel inferior mide aproximadamente 220-250px.
    // Con 17rem (272px) aseguramos que el lienzo flote justo por encima.
    // Aumentamos el pt a 5.5rem (88px) para despegar la tarjeta de los botones superiores (que miden ~64px).
    return 'pt-[calc(5.5rem+env(safe-area-inset-top,0px))] pb-[calc(17rem+env(safe-area-inset-bottom,0px))]';
  }

  return 'pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]';
}
export function getStoryCardSizeClass(): string {
  // `h-full` ensures the card always has a resolved height (preventing it from collapsing to 0x0).
  // `max-h-[...px]` prevents it from becoming too tall ("ocupar todo el largo") when panels are closed.
  // `w-auto max-w-full` paired with the aspect-9/16 class ensures the width scales perfectly with the height.
  return 'h-full max-h-[65dvh] md:max-h-[600px] w-auto max-w-full';
}
