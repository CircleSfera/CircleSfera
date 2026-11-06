// Content presentation shells: pathname → chrome / scroll / gesture regime

export type ContentShell =
  | 'create'
  | 'broadcast'
  | 'playback'
  | 'vertical'
  | 'map'
  | 'stream';

// Resolve the content shell for a location pathname (no search or hash)
export function getContentShell(pathname: string): ContentShell {
  if (pathname.startsWith('/create') || isEditsPath(pathname)) {
    return 'create';
  }
  if (pathname.startsWith('/live/broadcast')) {
    return 'broadcast';
  }
  // Live viewer (not broadcast)
  if (pathname.startsWith('/live/')) {
    return 'playback';
  }
  if (pathname.startsWith('/frames')) {
    return 'vertical';
  }
  if (pathname.startsWith('/explore/map')) {
    return 'map';
  }
  return 'stream';
}

// Hide TopNav and BottomNav; lock document scroll
export function isImmersiveShell(shell: ContentShell): boolean {
  return (
    shell === 'create' ||
    shell === 'broadcast' ||
    shell === 'playback' ||
    shell === 'map'
  );
}

// Lock the main column to the viewport; BottomNav may remain on vertical
export function isViewportLockedShell(shell: ContentShell): boolean {
  return (
    shell === 'create' ||
    shell === 'broadcast' ||
    shell === 'playback' ||
    shell === 'vertical' ||
    shell === 'map'
  );
}

// Hide mobile TopNav on create, broadcast, playback, and map shells
export function hidesTopNav(shell: ContentShell): boolean {
  return (
    shell === 'create' ||
    shell === 'broadcast' ||
    shell === 'playback' ||
    shell === 'map'
  );
}

// Hide BottomNav on create, broadcast, playback, and map shells
export function hidesBottomNav(shell: ContentShell): boolean {
  return (
    shell === 'create' ||
    shell === 'broadcast' ||
    shell === 'playback' ||
    shell === 'map'
  );
}

// The editor of the edits studio keeps the sidebar as a narrow rail of
// icons at every width; its list of projects is an ordinary page.
export function isEditsPath(pathname: string): boolean {
  return pathname.startsWith('/edits/');
}

/** The legal pages: the policies and the form to report illegal content. */
export const LEGAL_PATHS = [
  '/privacy',
  '/terms',
  '/guidelines',
  '/report-illegal-content',
] as const;

// Signed in, a legal page is a screen of its own, like a setting: it has its
// own bar with a way back, so neither bar of the app is shown on a phone.
export function isLegalPath(pathname: string): boolean {
  return (LEGAL_PATHS as readonly string[]).includes(pathname);
}
