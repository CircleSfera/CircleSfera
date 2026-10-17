import type { Prisma } from '@prisma/client';

type SettingsReader = Pick<
  Prisma.TransactionClient,
  'profile' | 'userSettings'
>;

/**
 * What a viewer asked to see of sensitive content: whether posts rated
 * mature are shown at all, and whether those shown are blurred until
 * pressed. Read from the settings of the person behind the Profile; a guest
 * sees no mature posts, blurred.
 */
export interface ViewerContent {
  allowMature: boolean;
  blurSensitiveContent: boolean;
}

const GUEST: ViewerContent = { allowMature: false, blurSensitiveContent: true };

export async function loadViewerContent(
  db: SettingsReader,
  profileId?: string | null,
): Promise<ViewerContent> {
  if (!profileId) return GUEST;
  // Settings belong to the person (User.id), not to the Profile.
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: { userId: true },
  });
  if (!profile) return GUEST;
  const settings = await db.userSettings.findUnique({
    where: { userId: profile.userId },
    select: { contentPreference: true, blurSensitiveContent: true },
  });
  return {
    allowMature: settings?.contentPreference === 'MATURE',
    blurSensitiveContent: settings?.blurSensitiveContent ?? true,
  };
}

/** The posts a list may show: mature ones only to who allows them. */
export function matureWhere(content: ViewerContent): Prisma.PostWhereInput {
  return content.allowMature ? {} : { contentRating: 'GENERAL' };
}

/**
 * Whether a post shows blurred: rated mature, and the viewer blurs sensitive
 * content or does not allow it (a mature post reached directly, by its link).
 * An author never sees their own post blurred.
 */
export function shouldBlur(
  post: { contentRating?: string | null; profileId?: string },
  content: ViewerContent,
  viewerProfileId?: string | null,
): boolean {
  if (post.contentRating !== 'MATURE') return false;
  if (viewerProfileId && post.profileId === viewerProfileId) return false;
  return content.blurSensitiveContent || !content.allowMature;
}
