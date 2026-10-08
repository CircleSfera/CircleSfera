import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import FrameClipControls from '../../create-post/FrameClipControls';
import type { PhotoEditorState } from '../usePhotoEditor';

export default function PhotoTrimPanel({
  editor,
}: {
  editor: PhotoEditorState;
}) {
  const { t } = useTranslation();
  const { videoData, setVideoData, constrainDuration, videoRef } = editor;

  return (
    <motion.div
      key="trim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="w-full max-w-md mx-auto flex flex-col gap-2 px-3 py-0.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-white/55 uppercase tracking-wider">
          {t('createPost.edit.audio')}
        </span>
        <button
          type="button"
          onClick={() => setVideoData((v) => ({ ...v, muted: !v.muted }))}
          className={`min-h-11 px-3 rounded-full text-[11px] font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
            videoData.muted
              ? 'bg-brand-secondary/20 text-brand-secondary'
              : 'bg-brand-primary/20 text-brand-primary'
          }`}
          aria-pressed={videoData.muted}
        >
          {videoData.muted
            ? t('createPost.edit.muted')
            : t('createPost.edit.with_sound')}
        </button>
      </div>
      {constrainDuration ? (
        <FrameClipControls
          sourceDurationSec={
            videoRef.current?.duration ||
            Math.max(videoData.endTime, constrainDuration.max)
          }
          window={{
            startTime: videoData.startTime,
            endTime: videoData.endTime,
          }}
          onChange={(next) => {
            setVideoData((v) => ({
              ...v,
              startTime: next.startTime,
              endTime: next.endTime,
            }));
            if (videoRef.current) {
              videoRef.current.currentTime = next.startTime;
            }
          }}
          showPresets
          compact
        />
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-white/55">
            {t('createPost.edit.trim_label', {
              seconds: Math.max(
                0,
                videoData.endTime - videoData.startTime,
              ).toFixed(1),
            })}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs w-8 tabular-nums text-white/50">
              {videoData.startTime.toFixed(1)}s
            </span>
            <input
              type="range"
              min={0}
              max={videoRef.current?.duration || 100}
              step={0.1}
              value={videoData.startTime}
              aria-label={t('createPost.edit.trim_start')}
              aria-valuetext={`${videoData.startTime.toFixed(1)}s`}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val < videoData.endTime) {
                  setVideoData((v) => ({ ...v, startTime: val }));
                  if (videoRef.current) videoRef.current.currentTime = val;
                }
              }}
              className="flex-1 appearance-none bg-transparent cursor-pointer outline-none h-11 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-2 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-white/10 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-brand-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full"
            />
            <input
              type="range"
              min={0}
              max={videoRef.current?.duration || 100}
              step={0.1}
              value={videoData.endTime}
              aria-label={t('createPost.edit.trim_end')}
              aria-valuetext={`${videoData.endTime.toFixed(1)}s`}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val > videoData.startTime) {
                  setVideoData((v) => ({ ...v, endTime: val }));
                  if (videoRef.current)
                    videoRef.current.currentTime = val - 0.1;
                }
              }}
              className="flex-1 appearance-none bg-transparent cursor-pointer outline-none h-11 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-brand-blue [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-2 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-white/10 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-brand-blue [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full"
            />
            <span className="text-xs w-8 text-right tabular-nums text-white/50">
              {videoData.endTime.toFixed(1)}s
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
