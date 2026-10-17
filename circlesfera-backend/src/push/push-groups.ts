// The groups a Profile switches push by. A notice outside every group
// (moderation, plan, payment, support) has no switch of its own: only
// pausing all push stops it.
export const PUSH_GROUPS = [
  'likes',
  'comments',
  'follows',
  'messages',
  'live',
] as const;

export type PushGroup = (typeof PUSH_GROUPS)[number];

// The Profile column that holds each group's switch.
export const PUSH_GROUP_COLUMN = {
  likes: 'pushLikes',
  comments: 'pushComments',
  follows: 'pushFollows',
  messages: 'pushMessages',
  live: 'pushLive',
} as const satisfies Record<PushGroup, string>;

const GROUP_OF_TYPE: Record<string, PushGroup> = {
  LIKE: 'likes',
  COMMENT_LIKE: 'likes',
  COMMENT: 'comments',
  MENTION: 'comments',
  FOLLOW: 'follows',
  FOLLOW_REQUEST: 'follows',
  FOLLOW_ACCEPTED: 'follows',
  MESSAGE: 'messages',
  REPLY_MESSAGE: 'messages',
  LIVE_STARTED: 'live',
};

/** The group of a kind of notification, or null when it cannot be switched off. */
export function pushGroupOf(type: string): PushGroup | null {
  return GROUP_OF_TYPE[type] ?? null;
}
