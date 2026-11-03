import { useTranslation } from 'react-i18next';
import { CREATE_THUMB, createThumbRatio } from './createStyles';
import { formatClipClock } from './FrameClipControls';
import type { FrameClip } from './frameClips';
import MediaOrderSheet from './MediaOrderSheet';
import { useFilmstrip } from './useFilmstrip';

/** The first frame of a clip, as its picture in the list. */
function ClipPicture({ clip }: { clip: FrameClip }) {
  const [frame] = useFilmstrip(clip.file, clip.ms, 1);
  return (
    <div
      className={`${CREATE_THUMB} border-white/10 bg-white/10`}
      style={{ aspectRatio: createThumbRatio('FRAME') }}
    >
      {frame ? (
        <img
          src={frame}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : null}
    </div>
  );
}

export interface FrameClipsOrderProps {
  clips: FrameClip[];
  onMove: (from: number, to: number) => void;
  onDone: () => void;
}

/** The clips of a Frame in the order sheet, each with its length. */
export default function FrameClipsOrder({
  clips,
  onMove,
  onDone,
}: FrameClipsOrderProps) {
  const { t } = useTranslation();
  return (
    <MediaOrderSheet
      title={t('frames.clips.order')}
      moveLabel={(clip) => t('frames.clips.move', { clip })}
      testId="frame-clips-order"
      onMove={onMove}
      onDone={onDone}
      items={clips.map((clip, index) => ({
        key: `${clip.file.name}-${clip.file.lastModified}-${clip.ms}`,
        picture: <ClipPicture clip={clip} />,
        label: t('frames.clips.item', { n: index + 1, total: clips.length }),
        detail: formatClipClock((clip.endMs - clip.startMs) / 1000),
      }))}
    />
  );
}
