import { useTranslation } from 'react-i18next';
import { PHOTO_FILTERS } from '../photo-editor/photoEditor.constants';
import { CREATE_QUICK_THUMB } from './createStyles';

interface QuickFilterRowProps {
  /** The photo on show, drawn under each filter. */
  imageUrl: string;
  /** The shape of the small previews, as a CSS aspect ratio. */
  ratio: string;
  /** The classes of the filter the photo has; empty for none. */
  selectedClass: string;
  onSelect: (filterClass: string) => void;
}

/**
 * The filters of the photo on show, one tap each, under the preview of the
 * edit step. The photo editor stays for adjusting, cropping and drawing.
 */
export default function QuickFilterRow({
  imageUrl,
  ratio,
  selectedClass,
  onSelect,
}: QuickFilterRowProps) {
  const { t } = useTranslation();

  return (
    <fieldset
      aria-label={t('createPost.edit.tab_filters')}
      className="flex overflow-x-auto items-start gap-3 px-4 py-2 scroll-px-4 no-scrollbar snap-x touch-pan-x shrink-0 border-0 m-0 min-w-0"
    >
      {PHOTO_FILTERS.map((filter) => {
        const isSelected = filter.class === selectedClass;
        return (
          <button
            type="button"
            key={filter.name}
            onClick={() => onSelect(filter.class)}
            aria-pressed={isSelected}
            className="flex flex-col items-center gap-1.5 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/25 rounded-lg snap-start"
          >
            <div
              style={{ aspectRatio: ratio }}
              className={`${CREATE_QUICK_THUMB} transition-colors ${
                isSelected ? 'border-brand-primary' : 'border-white/10'
              }`}
            >
              <img
                src={imageUrl}
                alt=""
                className={`w-full h-full object-cover ${filter.class}`}
              />
            </div>
            <span
              className={`text-xs font-medium leading-none ${
                isSelected ? 'text-white' : 'text-white/55'
              }`}
            >
              {filter.name}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
