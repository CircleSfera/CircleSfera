import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';

const FILTERS = [
  { key: 'normal', filter: '' },
  { key: 'bw', filter: 'grayscale(1) contrast(1.2)' },
  { key: 'sepia', filter: 'sepia(0.8) contrast(1.1)' },
  { key: 'neon', filter: 'hue-rotate(90deg) saturate(1.8)' },
  { key: 'drama', filter: 'contrast(1.5) saturate(1.3)' },
  { key: 'invert', filter: 'invert(0.9)' },
] as const;

export default function FiltersPanel() {
  const { t } = useTranslation();
  const { selectedClipId, updateClip } = useStudioStore();

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-bold uppercase tracking-wider text-white/50">
        {t('studio.filters.title')}
      </span>
      {!selectedClipId && (
        <p className="text-xs text-white/40 text-center py-2">
          {t('studio.filters.select_clip')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              if (!selectedClipId) {
                toast.error(t('studio.filters.select_clip'));
                return;
              }
              updateClip(
                selectedClipId,
                { filter: f.filter } as { filter: string },
                { history: true },
              );
              toast.success(
                t('studio.filters.applied', {
                  name: t(`studio.filters.${f.key}`),
                }),
              );
            }}
            className="bg-white/5 hover:bg-brand-primary/20 border border-white/10 hover:border-brand-primary/50 rounded-xl p-3 text-center transition-all min-h-11"
          >
            <span className="text-xs font-semibold text-white block">
              {t(`studio.filters.${f.key}`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
