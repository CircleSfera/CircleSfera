import { Injectable, Logger } from '@nestjs/common';
import { FollowStatus, Visibility } from '@prisma/client';
import { isRemoved } from '../common/policies/removed-content.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface PostLikeAccess {
  profileId: string;
  visibility: Visibility;
  isPremium: boolean;
  profile?: { privacyLevel?: Visibility } | null;
  moderationStatus?: string;
}

interface StoryAccess {
  id: string;
  profileId: string;
  isPremium: boolean;
  isCloseFriendsOnly: boolean;
  profile: { privacyLevel: Visibility } | null;
}

interface MessageAccess {
  id: string;
  conversationId: string;
  senderId: string;
  isLocked: boolean;
}

/**
 * Determines whether a given user (or anonymous visitor) is allowed
 * to access a media file served from `/uploads/`.
 *
 * Every content-owning table that stores user-uploaded media (PostMedia,
 * Story, Message, Comment, Collection) is checked in parallel for a URL
 * match. A file that matches none of them is a public asset
 * (avatar, cover, ...) and is allowed — this is the deliberate default,
 * not an oversight, so keep it that way when adding new content types:
 * add an explicit branch above the fallback, never rely on the fallback
 * to "cover" a new protected content type.
 *
 * Decision matrix (Post/Comment, Comment inherits its parent Post's policy):
 * ┌─────────────────────────┬───────────────────────────────────────────────┐
 * │ Condition               │ Allowed?                                     │
 * ├─────────────────────────┼───────────────────────────────────────────────┤
 * │ No matching content     │ Yes (avatars, public assets, etc.)           │
 * │ Post is PUBLIC + free   │ Yes                                          │
 * │ Post author == viewer   │ Yes                                          │
 * │ Post is PPV (isPremium) │ Only if viewer has a PostUnlock              │
 * │ Post is FOLLOWERS-only  │ Only if viewer follows the author            │
 * │ Post is PRIVATE (CF)    │ Only if viewer is in author's Close Friends  │
 * └─────────────────────────┴───────────────────────────────────────────────┘
 *
 * Story: author always allowed; isPremium requires StoryUnlock;
 * isCloseFriendsOnly requires CloseFriend (independent of profile privacy);
 * a private profile otherwise requires an ACCEPTED Follow.
 *
 * Message (DM/group chat attachments): requires the viewer to be an active
 * (non-"deleted for me") Participant of the conversation. isLocked (PPV
 * message) additionally requires a MessageUnlock, except for the sender.
 *
 * Collection: owner-only -- there is no shared/public collection viewing
 * feature in the API today.
 *
 * A post, story or comment removed by moderation is kept for its appeal and
 * shown to nobody, its author included: its files are for staff who
 * moderate content only (`isStaff`), and a comment's go with its post.
 */
// What a post's access is decided on, its moderation included.
const POST_ACCESS_SELECT = {
  profileId: true,
  visibility: true,
  isPremium: true,
  moderationStatus: true,
  profile: { select: { privacyLevel: true } },
} as const;

// The name of a video's stream folder: the UUID of the video file.
const STREAM_FOLDER =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MediaAuthService {
  private readonly logger = new Logger(MediaAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check whether `viewerProfileId` (may be null for anonymous) is allowed
   * to access the file at the given upload path.
   *
   * @returns `true` if access is granted, `false` if denied.
   */
  async isAccessAllowed(
    uploadPath: string,
    viewerUserId: string | null,
    viewerProfileId: string | null,
    isStaff: () => Promise<boolean> = () => Promise.resolve(false),
  ): Promise<boolean> {
    // Nginx passes the raw, undecoded $request_uri (including any query
    // string/fragment) via X-Original-URI, but its own `location /uploads/`
    // alias resolves the actual file from the decoded, query-stripped path.
    // Matching DB rows against the raw string would let a crafted suffix
    // (`?x=1`, stray percent-encoding, ...) miss every ownership lookup and
    // fall through to the public-asset default while Nginx still serves the
    // real (protected) file underneath. Normalise the same way Nginx's own
    // path resolution would before ever touching the database.
    let pathOnly = uploadPath.split(/[?#]/, 1)[0] ?? '';
    try {
      pathOnly = decodeURIComponent(pathOnly);
    } catch {
      this.logger.warn(
        `Malformed percent-encoding in upload path: ${uploadPath}`,
      );
      return false;
    }

    // Normalise to handle both "/uploads/foo/bar.jpg" and "foo/bar.jpg".
    const normalised = pathOnly.replace(/^\/uploads\//, '');
    // Only a canonical path is looked up: Nginx resolves "./", "%2e/", "//"
    // and the like before it serves the file, but the database rows hold the
    // canonical address, so any other spelling would match no row and fall
    // through to the public-asset default while the protected file is served.
    const segments = normalised.split('/');
    if (
      !normalised ||
      normalised.includes('\\') ||
      segments.some(
        (segment) => segment === '' || segment === '.' || segment === '..',
      )
    ) {
      this.logger.warn(`Rejected non-canonical upload path: ${uploadPath}`);
      return false;
    }

    // Direct access to GDPR export artifacts or private archives via static media path is forbidden
    if (normalised.startsWith('exports/')) {
      this.logger.warn(
        `Direct static access to export artifact denied: ${uploadPath}`,
      );
      return false;
    }

    // A file of a video's stream folder (<uuid>/master.m3u8, its segments,
    // its cover) is the video's: no row names a segment, so it is matched by
    // the folder, and gets the access of the content that holds the video.
    const [first, ...inFolder] = normalised.split('/');
    const needles =
      inFolder.length > 0 && STREAM_FOLDER.test(first)
        ? [`${first}/`, `${first}.`]
        : [normalised];
    const matchOn = (...columns: string[]) => ({
      OR: columns.flatMap((column) =>
        needles.map((needle) => ({ [column]: { contains: needle } })),
      ),
    });
    const urlMatch = matchOn('url', 'standardUrl', 'thumbnailUrl');

    let [postMedia, story, message, comment, collection, editProject] =
      await Promise.all([
        this.prisma.postMedia.findMany({
          where: urlMatch,
          select: {
            postId: true,
            post: { select: POST_ACCESS_SELECT },
          },
        }),
        // A story's painted layer is the story's as much as its picture.
        this.prisma.story.findMany({
          where: matchOn('url', 'standardUrl', 'thumbnailUrl', 'overlayUrl'),
          select: {
            id: true,
            profileId: true,
            isPremium: true,
            isCloseFriendsOnly: true,
            moderationStatus: true,
            profile: { select: { privacyLevel: true } },
          },
        }),
        // A voice note is the message's: personal data, for its conversation.
        this.prisma.message.findMany({
          where: matchOn('url', 'standardUrl', 'thumbnailUrl', 'voiceUrl'),
          select: {
            id: true,
            conversationId: true,
            senderId: true,
            isLocked: true,
          },
        }),
        this.prisma.comment.findMany({
          where: matchOn('url', 'standardUrl', 'thumbnailUrl', 'voiceUrl'),
          select: {
            postId: true,
            moderationStatus: true,
            post: { select: POST_ACCESS_SELECT },
          },
        }),
        this.prisma.collection.findMany({
          where: matchOn('coverUrl', 'standardUrl', 'thumbnailUrl'),
          select: { profileId: true },
        }),
        // A draft's media is its author's only.
        this.prisma.editProject.findMany({
          where: matchOn('mediaUrl'),
          select: { profileId: true },
        }),
      ]);

    // A file's own randomUUID()-based name should only ever genuinely match
    // one row, one table. But a `contains` match is substring-based, not an
    // exact key lookup — a malicious user could otherwise craft their own
    // PUBLIC post's url field (client-controlled, see MediaItemDto) to
    // literally embed a known/leaked protected filename, so a naive
    // "first matching table wins" would let that public post authorize
    // access to someone else's private/PPV file. Requiring every matched
    // owner (across every table) to independently grant access closes that
    // without costing anything in the normal, non-adversarial case.
    // A file of removed content: staff who moderate content may see it,
    // nobody else. The other rows naming the file are still checked.
    const removedPostMedia = postMedia.filter((media) => isRemoved(media.post));
    const removedStories = story.filter((item) => isRemoved(item));
    const removedComments = comment.filter(
      (item) => isRemoved(item) || isRemoved(item.post),
    );
    if (
      removedPostMedia.length + removedStories.length + removedComments.length >
      0
    ) {
      if (!(await isStaff())) {
        this.logger.debug(
          `Removed content, not for this viewer: ${uploadPath}`,
        );
        return false;
      }
      postMedia = postMedia.filter(
        (media) => !removedPostMedia.includes(media),
      );
      story = story.filter((item) => !removedStories.includes(item));
      comment = comment.filter((item) => !removedComments.includes(item));
      if (
        postMedia.length +
          story.length +
          message.length +
          comment.length +
          collection.length +
          editProject.length ===
        0
      ) {
        return true;
      }
    }

    const accessChecks: Promise<boolean>[] = [
      ...postMedia.map((media) =>
        this.checkPostAccess(
          media.postId,
          media.post,
          viewerUserId,
          viewerProfileId,
        ),
      ),
      ...story.map((item) =>
        this.checkStoryAccess(item, viewerUserId, viewerProfileId),
      ),
      ...message.map((item) =>
        this.checkMessageAccess(item, viewerUserId, viewerProfileId),
      ),
      ...comment.map((item) =>
        this.checkPostAccess(
          item.postId,
          item.post,
          viewerUserId,
          viewerProfileId,
        ),
      ),
      ...collection.map((item) =>
        Promise.resolve(item.profileId === viewerProfileId),
      ),
      ...editProject.map((item) =>
        Promise.resolve(item.profileId === viewerProfileId),
      ),
    ];

    if (accessChecks.length > 0) {
      const results = await Promise.all(accessChecks);
      const allowed = results.every(Boolean);
      if (!allowed) {
        this.logger.debug(
          `Access denied — at least one matched owner rejected: ${uploadPath}`,
        );
      }
      return allowed;
    }

    // No content-owning table references this file → public asset (avatar, etc.)
    return true;
  }

  private async checkPostAccess(
    postId: string,
    post: PostLikeAccess,
    viewerUserId: string | null,
    viewerProfileId: string | null,
  ): Promise<boolean> {
    // A post of a private account is its followers' only, whatever the
    // post's own audience, as the post itself is (assertCanAccessPost).
    const privateAccount = post.profile?.privacyLevel === Visibility.PRIVATE;
    if (
      post.visibility === Visibility.PUBLIC &&
      !post.isPremium &&
      !privateAccount
    ) {
      return true;
    }

    if (!viewerUserId || !viewerProfileId) {
      return false;
    }

    if (post.profileId === viewerProfileId) {
      return true;
    }

    const follows = () =>
      this.prisma.follow
        .findFirst({
          where: {
            followerId: viewerProfileId,
            followingId: post.profileId,
            status: FollowStatus.ACCEPTED,
          },
          select: { id: true },
        })
        .then((follow) => !!follow);
    if (privateAccount && !(await follows())) {
      return false;
    }
    if (post.visibility === Visibility.PUBLIC && !post.isPremium) {
      return true;
    }

    if (post.isPremium) {
      const unlock = await this.prisma.postUnlock.findUnique({
        where: { userId_postId: { userId: viewerUserId, postId } },
        select: { id: true },
      });
      return !!unlock;
    }

    if (post.visibility === Visibility.FOLLOWERS) {
      const follow = await this.prisma.follow.findFirst({
        where: {
          followerId: viewerProfileId,
          followingId: post.profileId,
          status: FollowStatus.ACCEPTED,
        },
        select: { id: true },
      });
      return !!follow;
    }

    if (post.visibility === Visibility.PRIVATE) {
      const closeFriend = await this.prisma.closeFriend.findFirst({
        where: { profileId: post.profileId, friendId: viewerProfileId },
        select: { id: true },
      });
      return !!closeFriend;
    }

    return false;
  }

  private async checkStoryAccess(
    story: StoryAccess,
    viewerUserId: string | null,
    viewerProfileId: string | null,
  ): Promise<boolean> {
    if (story.profileId === viewerProfileId) {
      return true;
    }

    if (!viewerUserId || !viewerProfileId) {
      return false;
    }

    if (story.isPremium) {
      const unlock = await this.prisma.storyUnlock.findUnique({
        where: { userId_storyId: { userId: viewerUserId, storyId: story.id } },
        select: { id: true },
      });
      if (!unlock) {
        return false;
      }
    }

    if (story.isCloseFriendsOnly) {
      const closeFriend = await this.prisma.closeFriend.findUnique({
        where: {
          profileId_friendId: {
            profileId: story.profileId,
            friendId: viewerProfileId,
          },
        },
        select: { id: true },
      });
      return !!closeFriend;
    }

    const isProfilePrivate = story.profile?.privacyLevel === Visibility.PRIVATE;
    if (isProfilePrivate) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerProfileId,
            followingId: story.profileId,
          },
        },
        select: { status: true },
      });
      return follow?.status === FollowStatus.ACCEPTED;
    }

    return true;
  }

  private async checkMessageAccess(
    message: MessageAccess,
    viewerUserId: string | null,
    viewerProfileId: string | null,
  ): Promise<boolean> {
    if (!viewerProfileId) {
      return false;
    }

    const participant = await this.prisma.participant.findFirst({
      where: {
        conversationId: message.conversationId,
        profileId: viewerProfileId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!participant) {
      return false;
    }

    if (message.isLocked && message.senderId !== viewerProfileId) {
      if (!viewerUserId) {
        return false;
      }
      const unlock = await this.prisma.messageUnlock.findUnique({
        where: {
          userId_messageId: { userId: viewerUserId, messageId: message.id },
        },
        select: { id: true },
      });
      return !!unlock;
    }

    return true;
  }
}
