/** Who sees a story: every follower, or only the close friends list. */
export type StoryAudience = 'everyone' | 'close_friends';

/**
 * What the story editor needs to share the story itself, as Instagram does,
 * instead of handing a picture back to another step.
 */
export interface StoryShareOptions {
  closeFriendsCount: number;
  onManageCloseFriends: () => void;
  /** The story is being uploaded and created. */
  isSharing: boolean;
  /** The song of the story, if one was chosen. */
  musicTitle: string | null;
  onOpenMusic: () => void;
  /** The place of the story, if one was chosen. */
  placeName: string | null;
  onOpenPlace: () => void;
}
