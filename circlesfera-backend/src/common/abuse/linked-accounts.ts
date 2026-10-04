import type { Prisma } from '@prisma/client';

// Other accounts that share a signup or last-access IP hash, or a device
// hash, with this account. Shared networks (mobile carriers, offices) also
// match, so this is a review signal, never proof. Returns null when the
// account has no IP or device signal to compare.
export function linkedAccountsWhere(user: {
  id: string;
  signupIpHash: string | null;
  lastIpHash: string | null;
  deviceSignals: { visitorHash: string }[];
}): Prisma.UserWhereInput | null {
  const visitorHashes = user.deviceSignals.map((d) => d.visitorHash);
  const ipHashes = [user.signupIpHash, user.lastIpHash].filter(
    (h): h is string => !!h,
  );
  if (ipHashes.length === 0 && visitorHashes.length === 0) return null;
  return {
    id: { not: user.id },
    OR: [
      ...(ipHashes.length
        ? [{ signupIpHash: { in: ipHashes } }, { lastIpHash: { in: ipHashes } }]
        : []),
      ...(visitorHashes.length
        ? [{ deviceSignals: { some: { visitorHash: { in: visitorHashes } } } }]
        : []),
    ],
  };
}
