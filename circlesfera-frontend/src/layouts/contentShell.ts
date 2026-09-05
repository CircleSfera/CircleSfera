// Content presentation shells: pathname → chrome / scroll / gesture regime

export type ContentShell =
  | 'create'
  | 'broadcast'
  | 'playback'
  | 'vertical'
  | 'stream';

// Resolve the content shell for a location pathname (no search or hash)
export function getContentShell(pathname: string): ContentShell {
  if (pathname.startsWith('/create') || pathname.startsWith('/edits')) {
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
  return 'stream';
}

// Hide TopNav and BottomNav; lock document scroll
export function isImmersiveShell(shell: ContentShell): boolean {
  return shell === 'create' || shell === 'broadcast' || shell === 'playback';
}

// Lock the main column to the viewport; BottomNav may remain on vertical
export function isViewportLockedShell(shell: ContentShell): boolean {
  return (
    shell === 'create' ||
    shell === 'broadcast' ||
    shell === 'playback' ||
    shell === 'vertical'
  );
}

// Hide mobile TopNav on create, broadcast, and playback shells
export function hidesTopNav(shell: ContentShell): boolean {
  return shell === 'create' || shell === 'broadcast' || shell === 'playback';
}

// Hide BottomNav on create, broadcast, and playback shells
export function hidesBottomNav(shell: ContentShell): boolean {
  return shell === 'create' || shell === 'broadcast' || shell === 'playback';
}

// Hide Sidebar even on md+ (edits studio only — checked separately via pathname)
export function isEditsPath(pathname: string): boolean {
  return pathname.startsWith('/edits');
}
