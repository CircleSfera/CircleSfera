export type TabType = 'posts' | 'frames' | 'lives' | 'saved' | 'tagged';

// The Lives tab shows only where broadcasts are recorded (set at build time
// with VITE_LIVE_RECORDING_ENABLED); elsewhere it would always be empty.
export const LIVES_TAB_SHOWN =
  import.meta.env.VITE_LIVE_RECORDING_ENABLED === 'true';

export const PROFILE_TABS: TabType[] = [
  'posts',
  'frames',
  'lives',
  'saved',
  'tagged',
];

export function profileTabFromParam(
  tab: string | null,
  isMe: boolean,
): TabType {
  if (tab === 'saved' && !isMe) return 'posts';
  // A link to a tab this build does not show opens the posts.
  if (tab === 'lives' && !LIVES_TAB_SHOWN) return 'posts';
  if (tab && PROFILE_TABS.includes(tab as TabType)) {
    return tab as TabType;
  }
  return 'posts';
}
