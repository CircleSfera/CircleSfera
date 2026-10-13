import { type Prisma, Visibility } from '@prisma/client';

type Client = Pick<Prisma.TransactionClient, 'profile' | 'follow'>;

// Sets who may see one Profile. The choice belongs to the Profile: the other
// Profiles of the same person keep theirs.
//
// A Profile that stops being private no longer asks before it is followed,
// so the requests that were waiting are accepted with it. Returns how many.
export async function setProfilePrivacy(
  prisma: Client,
  profileId: string,
  privacyLevel: Visibility,
): Promise<{ acceptedRequests: number }> {
  const before = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { privacyLevel: true },
  });
  await prisma.profile.update({
    where: { id: profileId },
    data: { privacyLevel },
  });
  if (
    before?.privacyLevel !== Visibility.PRIVATE ||
    privacyLevel === Visibility.PRIVATE
  ) {
    return { acceptedRequests: 0 };
  }
  const { count } = await prisma.follow.updateMany({
    where: { followingId: profileId, status: 'PENDING' },
    data: { status: 'ACCEPTED' },
  });
  return { acceptedRequests: count };
}
