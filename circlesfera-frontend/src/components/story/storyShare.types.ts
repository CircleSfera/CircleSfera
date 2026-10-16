/** A song as the music sticker shows it. */
export interface MusicTrack {
  title: string;
  artist: string;
  cover: string | null;
}

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
  /** The song as the music sticker shows it; null when none was chosen. */
  musicSticker?: MusicTrack | null;
  onOpenMusic: () => void;
  /** The place of the story, if one was chosen, with its area. */
  placeName: string | null;
  /**
   * The place's own name, as the location sticker shows it to viewers; null
   * when the story has no place to put on it.
   */
  placeStickerName: string | null;
  onOpenPlace: () => void;
}
