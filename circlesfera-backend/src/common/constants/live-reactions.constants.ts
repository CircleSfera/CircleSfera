// The reactions that come with the Elite Creator and Business plans in a
// live broadcast. Anyone sees them float; only a Profile on one of those
// plans can send them.
export const ELITE_LIVE_REACTIONS: readonly string[] = [
  '💎',
  '👑',
  '⚡',
  '🎉',
  '💯',
];

export function isEliteLiveReaction(reaction: string): boolean {
  return ELITE_LIVE_REACTIONS.includes(reaction);
}
