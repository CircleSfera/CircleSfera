import type { TabType } from './ProfileTabs';

export const PROFILE_TABS: TabType[] = ['posts', 'frames', 'saved', 'tagged'];

export function profileTabFromParam(
  tab: string | null,
  isMe: boolean,
): TabType {
  if (tab === 'saved' && !isMe) return 'posts';
  if (tab && PROFILE_TABS.includes(tab as TabType)) {
    return tab as TabType;
  }
  return 'posts';
}
