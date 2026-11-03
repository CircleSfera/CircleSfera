import { useTranslation } from 'react-i18next';
import { PHOTO_RANGE_CLASS } from '../photo-editor/photoEditor.look';
import { CREATE_PRIMARY, createThumbRatio } from './createStyles';
import type { FrameClip } from './frameClips';
import { FRAME_FILTER_STRENGTH_MAX } from './frameLook';
import QuickFilterRow from './QuickFilterRow';
import { useFilmstrip } from './useFilmstrip';

/** The filter of a whole Frame and how strong it is. */
export interface FrameFilter {
  filterClass: string;
  strength: number;
}

export const NO_FRAME_FILTER: FrameFilter = {
  filterClass: '',
  strength: FRAME_FILTER_STRENGTH_MAX,
};

interface FrameFilterPanelProps {
  /** The clip whose picture shows each filter. */
  clip: FrameClip;
  filter: FrameFilter;
  onChange: (filter: FrameFilter) => void;
  onDone: () => void;
}

/**
 * The filters of a Frame, as on Reels: one strip for the whole Frame, and
 * how strong the one chosen is. Done goes back to the clips.
 */
export default function FrameFilterPanel({
  clip,
  filter,
  onChange,
  onDone,
}: FrameFilterPanelProps) {
  const { t } = useTranslation();
  const [still] = useFilmstrip(clip.file, clip.ms, 1);

  return (
    <div className="flex flex-col gap-3" data-testid="frame-filter-panel">
      <QuickFilterRow
        imageUrl={still}
        ratio={createThumbRatio('FRAME')}
        selectedClass={filter.filterClass}
        onSelect={(filterClass) =>
          onChange({
            filterClass,
            // Another filter starts at its full strength.
            strength:
              filterClass === filter.filterClass
                ? filter.strength
                : FRAME_FILTER_STRENGTH_MAX,
          })
        }
      />
      {filter.filterClass ? (
        <label className="flex items-center gap-3 px-4">
          <span className="shrink-0 text-sm font-semibold">
            {t('frames.clips.filter_strength')}
          </span>
          <input
            type="range"
            min={0}
            max={FRAME_FILTER_STRENGTH_MAX}
            value={filter.strength}
            onChange={(event) =>
              onChange({ ...filter, strength: Number(event.target.value) })
            }
            className={`min-w-0 flex-1 ${PHOTO_RANGE_CLASS}`}
          />
          <span className="w-8 shrink-0 text-right text-sm tabular-nums">
            {filter.strength}
          </span>
        </label>
      ) : null}
      <div className="flex justify-end px-4">
        <button
          type="button"
          onClick={onDone}
          className={`${CREATE_PRIMARY} min-h-11 px-5`}
        >
          {t('frames.clips.filters_done')}
        </button>
      </div>
    </div>
  );
}
