import { Music } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';
import {
  CREATE_PRIMARY,
  CREATE_SECONDARY,
} from '../../create-post/createStyles';
import { buildMusicElement } from '../storyComposer.append';
import type { MusicTrack } from '../storyShare.types';
import { StoryStickerSetup } from './StoryStickerSetup';

/**
 * Sets up the music sticker, which is the song of the story: with no song
 * yet it opens the song picker, and adds the sticker once one is chosen.
 */
export default function StoryMusicPanel({
  track,
  onOpenMusic,
  onStory,
  onAdd,
}: {
  track: MusicTrack | null;
  onOpenMusic: () => void;
  /** The story already shows its song. */
  onStory: boolean;
  onAdd: (el: StoryElement) => void;
}) {
  const { t } = useTranslation();
  const [awaitingTrack, setAwaitingTrack] = useState(false);

  useEffect(() => {
    if (awaitingTrack && track) {
      setAwaitingTrack(false);
      onAdd(buildMusicElement(track));
    }
  }, [awaitingTrack, track, onAdd]);

  const choose = () => {
    if (!onStory) setAwaitingTrack(true);
    onOpenMusic();
  };

  return (
    <StoryStickerSetup
      panelKey="music-tab"
      icon={Music}
      title={t('createPost.storyComposer.tool_music')}
      hint={t('createPost.storyComposer.music_create_hint')}
    >
      {onStory ? (
        <p className="text-sm text-white/60 text-center">
          {t('createPost.storyComposer.music_on_story')}
        </p>
      ) : null}
      {track && !onStory ? (
        <button
          type="button"
          onClick={() => onAdd(buildMusicElement(track))}
          className={`button-alone ${CREATE_PRIMARY}`}
        >
          {t('createPost.storyComposer.add_music_sticker', {
            title: track.title,
          })}
        </button>
      ) : null}
      <button
        type="button"
        onClick={choose}
        className={`button-alone ${track ? CREATE_SECONDARY : CREATE_PRIMARY}`}
      >
        {t(
          track
            ? 'createPost.storyComposer.music_change'
            : 'createPost.storyComposer.music_choose',
        )}
      </button>
    </StoryStickerSetup>
  );
}
