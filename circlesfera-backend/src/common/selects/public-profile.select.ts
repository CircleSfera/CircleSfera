import type { Prisma } from '@prisma/client';

// What another participant may read of a Profile that comes with content:
// who wrote a post, a story, a message, a notice. Nothing that tells who the
// person or the sign-in behind it is, so two Profiles of one person cannot
// be linked, nor how it was sanctioned or how it is set up. Never widen it
// to the whole Profile or add `user`.
export const PUBLIC_PROFILE_SELECT = {
  id: true,
  username: true,
  fullName: true,
  bio: true,
  avatar: true,
  standardUrl: true,
  thumbnailUrl: true,
  verificationLevel: true,
  accountType: true,
  privacyLevel: true,
} satisfies Prisma.ProfileSelect;
