import type { Prisma } from '@prisma/client';

// Account-level User columns that may travel alongside another profile's
// content. Never widen this to `user: true`: User carries the password hash,
// 2FA secret, reset/verification tokens, raw IPs, email, date of birth and
// Stripe identifiers.
export const PUBLIC_USER_SELECT = {
  id: true,
  isActive: true,
} satisfies Prisma.UserSelect;
