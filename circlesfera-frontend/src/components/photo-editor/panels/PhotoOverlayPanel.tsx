import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PHOTO_RANGE_CLASS } from '../photoEditor.look';
import type { PhotoEditorState } from '../usePhotoEditor';

export default function PhotoOverlayPanel({
  editor,
}: {
  editor: PhotoEditorState;
}) {
  const { t } = useTranslation();
  const {
    drawMode,
    setDrawMode,
    overlays,
    setOverlays,
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    selectedOverlayId,
    setSelectedOverlayId,
  } = editor;

  return (
    <motion.div
      key="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="w-full sm:max-w-sm mx-auto flex flex-col gap-2.5 px-4 py-1"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setDrawMode(!drawMode)}
          className={`min-h-11 h-11 px-3 text-[11px] font-bold rounded-lg transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
            drawMode
              ? 'bg-brand-primary text-white'
              : 'bg-white/5 text-white/60 hover:text-white'
          }`}
        >
          {drawMode
            ? t('createPost.edit.overlay_drawing')
            : t('createPost.edit.overlay_draw')}
        </button>
        <button
          type="button"
          onClick={() => {
            setDrawMode(false);
            const newId = crypto.randomUUID();
            setOverlays([
              ...overlays,
              {
                id: newId,
                type: 'text',
                x: 50,
                y: 50,
                text: t('createPost.edit.overlay_new_text'),
                fill: brushColor,
                fontSize: 30,
              },
            ]);
          }}
          className="min-h-11 h-11 px-3 text-[11px] font-bold rounded-lg bg-white/5 text-white/60 hover:text-white transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/25"
        >
          {t('createPost.edit.overlay_add_text')}
        </button>
        {selectedOverlayId && (
          <button
            type="button"
            onClick={() => {
              setOverlays(overlays.filter((o) => o.id !== selectedOverlayId));
              setSelectedOverlayId(null);
            }}
            className="min-h-11 h-11 px-3 text-[11px] font-bold rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all inline-flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
          >
            <Trash2 size={12} /> {t('createPost.edit.overlay_delete')}
          </button>
        )}
      </div>
      <div className="flex gap-1.5 justify-center">
        {['🔥', '❤️', '✨', '😂', '😎'].map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              setDrawMode(false);
              const newId = crypto.randomUUID();
              setOverlays([
                ...overlays,
                {
                  id: newId,
                  type: 'text',
                  x: 100,
                  y: 100,
                  text: emoji,
                  fill: '#ffffff',
                  fontSize: 60,
                },
              ]);
            }}
            className="min-w-11 min-h-11 text-xl hover:scale-105 transition-transform outline-none focus-visible:ring-2 focus-visible:ring-white/25 rounded-lg"
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      {drawMode && (
        <div className="flex items-center gap-2.5">
          <input
            type="color"
            value={brushColor}
            onChange={(e) => setBrushColor(e.target.value)}
            className="w-11 h-11 rounded cursor-pointer border-0 p-0 shrink-0"
            aria-label={t('createPost.edit.overlay_brush_color')}
          />
          <input
            type="range"
            min={1}
            max={20}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className={`flex-1 ${PHOTO_RANGE_CLASS}`}
            aria-label={t('createPost.edit.overlay_brush_size')}
          />
        </div>
      )}
    </motion.div>
  );
}
