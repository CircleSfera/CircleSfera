import type { Prisma } from '@prisma/client';

// Account-level User columns that may travel alongside another profile's
// content. Never widen this to `user: true`: User carries the password hash,
// 2FA secret, reset/verification tokens, raw IPs, email, date of birth and
// Stripe identifiers.
export const PUBLIC_USER_SELECT = {
  id: true,
  isActive: true,
} satisfies Prisma.UserSelect;

// Same as PUBLIC_USER_SELECT plus the privacy level, for access policies that
// must decide whether a private account's content is visible to the viewer.
export const PUBLIC_USER_WITH_PRIVACY_SELECT = {
  ...PUBLIC_USER_SELECT,
  settings: { select: { privacyLevel: true } },
} satisfies Prisma.UserSelect;
