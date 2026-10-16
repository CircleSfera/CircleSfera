import { useTranslation } from 'react-i18next';
import {
  MusicBars,
  MusicCover,
  type MusicPayload,
} from '../story/storyInteractive';
import { STICKER_CARD } from './stickerStyles';

/** The song of a story: a tap turns the story's sound on or off. */
export function MusicSticker({
  track,
  muted,
  onToggleSound,
}: {
  track: MusicPayload;
  muted: boolean;
  onToggleSound: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggleSound}
      aria-pressed={!muted}
      aria-label={t(muted ? 'story.music.sound_on' : 'story.music.sound_off', {
        title: track.title,
        artist: track.artist,
      })}
      className={`${STICKER_CARD} flex w-[240px] min-h-11 items-center gap-2.5`}
    >
      <MusicCover cover={track.cover} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-white">
          {track.title}
        </span>
        <span className="block truncate text-xs text-white/60">
          {track.artist}
        </span>
      </span>
      <MusicBars still={muted} />
    </button>
  );
}
