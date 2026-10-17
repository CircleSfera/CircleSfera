import type { ProfileMemberRole } from '@prisma/client';

// What a person can do on a Profile (ADR-0028). The owner can do all of
// them; a member, what the role allows. A closed list: a new action is
// added here, with the roles that may take it.
export const PROFILE_ACTIONS = [
  'content.manage',
  'comments.answer',
  'analytics.read',
  'profile.edit',
  'promotions.create',
  'billing.manage',
  'team.manage',
  'messages.read',
  'profile.delete',
] as const;

export type ProfileAction = (typeof PROFILE_ACTIONS)[number];

// What each role of a member allows. Money, the team, direct messages and
// deleting the Profile stay with the owner.
export const ROLE_ACTIONS: Record<ProfileMemberRole, readonly ProfileAction[]> =
  {
    ADMINISTRATOR: [
      'content.manage',
      'comments.answer',
      'analytics.read',
      'profile.edit',
    ],
    EDITOR: ['content.manage', 'comments.answer', 'analytics.read'],
  };

export function roleAllows(
  role: ProfileMemberRole,
  action: ProfileAction,
): boolean {
  return ROLE_ACTIONS[role].includes(action);
}
