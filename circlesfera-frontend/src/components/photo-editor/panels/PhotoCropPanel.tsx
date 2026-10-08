import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PHOTO_RANGE_CLASS } from '../photoEditor.look';
import type { PhotoEditorState } from '../usePhotoEditor';

export default function PhotoCropPanel({
  editor,
}: {
  editor: PhotoEditorState;
}) {
  const { t } = useTranslation();
  const { aspect, setAspect, rotation, setRotation } = editor;

  return (
    <motion.div
      key="crop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="w-full sm:max-w-sm mx-auto flex flex-col gap-2.5 px-4 py-1"
    >
      <div className="flex justify-between gap-1.5">
        {(
          [
            {
              key: 'free',
              aspect: undefined as number | undefined,
              label: t('createPost.edit.crop_free'),
            },
            {
              key: '1:1',
              aspect: 1,
              label: t('createPost.edit.crop_1_1'),
            },
            {
              key: '4:5',
              aspect: 4 / 5,
              label: t('createPost.edit.crop_4_5'),
            },
            {
              key: '16:9',
              aspect: 16 / 9,
              label: t('createPost.edit.crop_16_9'),
            },
          ] as const
        ).map((opt) => {
          const isActive =
            opt.aspect === undefined
              ? aspect === undefined
              : aspect === opt.aspect;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setAspect(opt.aspect)}
              className={`flex-1 min-h-11 h-11 text-sm font-semibold rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
                isActive
                  ? 'bg-brand-primary/20 text-brand-primary'
                  : 'bg-white/5 text-white/60 hover:text-white/80'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-semibold text-white/70 shrink-0">
          {t('createPost.edit.crop_rotation')}
        </span>
        <input
          type="range"
          min={-180}
          max={180}
          value={rotation}
          aria-label={t('createPost.edit.crop_rotation')}
          aria-valuetext={`${rotation}°`}
          onChange={(e) => setRotation(Number(e.target.value))}
          className={`flex-1 ${PHOTO_RANGE_CLASS}`}
        />
        <span className="text-sm font-semibold text-brand-primary w-10 tabular-nums text-right shrink-0">
          {rotation}°
        </span>
      </div>
    </motion.div>
  );
}
