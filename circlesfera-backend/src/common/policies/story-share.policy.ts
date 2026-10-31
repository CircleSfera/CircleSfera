import type { Prisma } from '@prisma/client';

// A post or Frame anyone can see: shown to everyone, free, not deleted,
// archived, hidden or removed, by a public Profile. Only such a post is
// shared to a story, and the card a story shows of it stays only while it
// remains so; who sees the card is checked for each viewer apart.
export const OPEN_POST = {
  deletedAt: null,
  archivedAt: null,
  moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
  visibility: 'PUBLIC',
  isPremium: false,
  profile: { privacyLevel: 'PUBLIC' },
} satisfies Prisma.PostWhereInput;
