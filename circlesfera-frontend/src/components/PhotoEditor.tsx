import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Crop,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import type { OverlayElement } from '../services/edits.service';
import CanvasOverlay from './CanvasOverlay';
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  PHOTO_ADJUSTMENT_CONFIG,
  PHOTO_FILTERS,
  type PhotoAdjustments,
} from './photo-editor/photoEditor.constants';

type Adjustments = PhotoAdjustments;
const DEFAULT_ADJUSTMENTS = DEFAULT_PHOTO_ADJUSTMENTS;
const FILTERS = PHOTO_FILTERS;
const ADJUSTMENT_CONFIG = PHOTO_ADJUSTMENT_CONFIG;

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface VideoData {
  startTime: number;
  endTime: number;
  muted: boolean;
}

interface PhotoEditorProps {
  image: File;
  onSave: (
    file: File,
    filter: string,
    cropData?: CropData,
    overlayDataUrl?: string,
    videoData?: VideoData,
  ) => void;
  onCancel: () => void;
  onStateChange?: (state: any) => void;
  initialState?: any;
  onApplyToAll?: (filterString: string) => void;
}

const AdjustmentSlider = ({
  label,
  value,
  defaultValue,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  unit: string;
  onChange: (val: number) => void;
}) => {
  const isModified = value !== defaultValue;
  return (
    <motion.div
      className="space-y-2.5 px-4 py-2"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex justify-between text-xs font-bold uppercase tracking-[0.12em]">
        <span className="text-white/30">{label}</span>
        <span className={isModified ? 'text-brand-primary' : 'text-white/20'}>
          {value}
          {unit}
        </span>
      </div>
      <div className="relative">
        {/* Center marker for bidirectional sliders */}
        {min === 0 && max >= 200 && (
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2 pointer-events-none" />
        )}
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full appearance-none bg-transparent cursor-pointer outline-none [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(140, 82, 255,0.5)] [&::-webkit-slider-thumb]:-mt-1.5 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-white/10 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-brand-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full"
        />
      </div>
    </motion.div>
  );
};

export default function PhotoEditor({
  image,
  onSave,
  onCancel,
  onStateChange,
  initialState,
  onApplyToAll,
}: PhotoEditorProps) {
  const { t } = useTranslation();
  const isVideo = image.type.startsWith('video');

  const [activeTab, setActiveTab] = useState<
    'FILTERS' | 'ADJUST' | 'CROP' | 'OVERLAY' | 'TRIM'
  >('FILTERS');

  const [selectedFilter, setSelectedFilter] = useState(
    initialState?.filter
      ? FILTERS.find((f) => f.class === initialState.filter) || FILTERS[0]
      : FILTERS[0],
  );

  const [adjustments, setAdjustments] = useState<Adjustments>(
    initialState?.adjustments || DEFAULT_ADJUSTMENTS,
  );

  const [activeAdjustment, setActiveAdjustment] =
    useState<keyof Adjustments>('brightness');

  // Crop state
  const [crop, setCrop] = useState(
    initialState?.cropData
      ? { x: initialState.cropData.x, y: initialState.cropData.y }
      : { x: 0, y: 0 },
  );
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(
    initialState?.cropData?.rotation || 0,
  );
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropData | null>(
    initialState?.cropData || null,
  );

  const [overlays, setOverlays] = useState<OverlayElement[]>(
    initialState?.overlays || [],
  );
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(
    null,
  );

  const [drawMode, setDrawMode] = useState(false);
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(5);

  const [videoData, setVideoData] = useState({
    startTime: initialState?.videoData?.startTime || 0,
    endTime: initialState?.videoData?.endTime || 0, // 0 means end of video initially
    muted: initialState?.videoData?.muted || false,
  });

  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<any>(null);
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDims = () => {
      if (imageRef.current) {
        setImageDims({
          width: imageRef.current.clientWidth,
          height: imageRef.current.clientHeight,
        });
      }
    };
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, []); // Re-calculate when tabs change

  const onCropComplete = useCallback(
    (_croppedArea: any, croppedAreaPixels: any) => {
      setCroppedAreaPixels({ ...croppedAreaPixels, rotation });
    },
    [rotation],
  );

  const [previewUrl] = useState(URL.createObjectURL(image));
  const [thumbnailUrl, setThumbnailUrl] = useState<string>(previewUrl);
  // Auto-save effect
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        filter: selectedFilter.class,
        adjustments,
        cropData: croppedAreaPixels,
        overlays,
      });
    }
  }, [selectedFilter, adjustments, croppedAreaPixels, overlays, onStateChange]);

  const isAdjusted =
    JSON.stringify(adjustments) !== JSON.stringify(DEFAULT_ADJUSTMENTS);

  // Generate thumbnail for video files
  useEffect(() => {
    if (isVideo) {
      const video = document.createElement('video');
      video.src = previewUrl;
      video.muted = true;
      video.playsInline = true;
      video.currentTime = 0.1;

      const captureFrame = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setThumbnailUrl(canvas.toDataURL());
        }
      };

      video.onloadeddata = () => {
        video.currentTime = 0.1;
        if (videoData.endTime === 0) {
          setVideoData((v) => ({ ...v, endTime: video.duration }));
        }
      };
      video.onseeked = () => {
        captureFrame();
      };
    }
  }, [previewUrl, isVideo, videoData.endTime]);

  // Video loop handling
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return;

    const handleTimeUpdate = () => {
      if (videoData.endTime > 0 && v.currentTime >= videoData.endTime) {
        v.currentTime = videoData.startTime;
        v.play();
      }
    };
    v.addEventListener('timeupdate', handleTimeUpdate);
    return () => v.removeEventListener('timeupdate', handleTimeUpdate);
  }, [videoData.startTime, videoData.endTime, isVideo]);

  const computedStyle = useMemo(() => {
    return {
      filter: `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) sepia(${adjustments.sepia}%) grayscale(${adjustments.grayscale}%) hue-rotate(${adjustments.hue}deg) blur(${adjustments.blur}px)`,
    };
  }, [adjustments]);

  const handleSave = () => {
    const filterString = `filter-class:${selectedFilter.class}__style:${computedStyle.filter}__temp:${adjustments.temperature}__vignette:${adjustments.vignette}__noise:${adjustments.noise}`;
    let overlayDataUrl: string | undefined;
    if (stageRef.current) {
      // Export at double resolution for crispness, but this depends on original image
      // Let's just do pixelRatio: 2 for now, or match it to the ratio of naturalWidth / displayWidth
      const pixelRatio = imageRef.current
        ? imageRef.current.naturalWidth / imageDims.width
        : 2;
      overlayDataUrl = stageRef.current.toDataURL({ pixelRatio });
    }
    onSave(
      image,
      filterString,
      croppedAreaPixels || undefined,
      overlayDataUrl,
      isVideo ? videoData : undefined,
    );
  };

  return (
    <div className="flex flex-col h-full bg-black text-white">
      {/* Header — same glass icon language as StoryComposerChrome (ADR-0018) */}
      <header className="flex justify-between items-center gap-2 shrink-0 z-10 px-3.5 pb-1.5 pt-[max(0.75rem,calc(env(safe-area-inset-top,0px)+0.35rem))] bg-linear-to-b from-black via-black/90 to-transparent">
        <button
          type="button"
          onClick={onCancel}
          className="min-w-11 min-h-11 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/16 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          aria-label={t('createPost.edit.cancel')}
        >
          <X size={18} strokeWidth={2} />
        </button>
        <h1 className="text-[15px] font-bold tracking-tight text-white truncate flex-1 text-center px-1">
          {t('createPost.edit.edit_media')}
        </h1>
        <div className="flex items-center gap-1.5 shrink-0">
          {onApplyToAll && (
            <button
              type="button"
              onClick={() => {
                const filterString = `filter-class:${selectedFilter.class}__style:${computedStyle.filter}__temp:${adjustments.temperature}__vignette:${adjustments.vignette}__noise:${adjustments.noise}`;
                onApplyToAll(filterString);
              }}
              className="min-h-11 px-3 text-xs font-bold bg-white/10 hover:bg-white/16 rounded-full text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              {t('createPost.edit.apply_to_all')}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="min-h-11 px-4 rounded-full bg-linear-to-r from-brand-primary to-brand-blue text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-brand-primary/25 transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
            aria-label={t('createPost.edit.done')}
          >
            {t('createPost.edit.done')} <Check size={14} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* Preview Area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-zinc-950 min-h-0">
        <div className="absolute inset-0 bg-radial-[at_50%_50%] from-white/1 via-transparent to-transparent pointer-events-none" />
        <div className="relative w-full h-full flex items-center justify-center p-4">
          {isVideo ? (
            <video
              ref={videoRef}
              src={previewUrl}
              className={`max-w-full max-h-full object-contain rounded-lg ${selectedFilter.class}`}
              style={computedStyle}
              controls={false}
              playsInline
              loop
              autoPlay
              muted={videoData.muted}
            />
          ) : activeTab === 'CROP' ? (
            <div className="absolute inset-0">
              <Cropper
                image={previewUrl}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
                style={{
                  containerStyle: { background: 'transparent' },
                  mediaStyle: computedStyle,
                }}
              />
            </div>
          ) : (
            <img
              ref={imageRef}
              src={previewUrl}
              alt="Upload preview"
              className={`max-w-full max-h-full object-contain rounded-lg ${selectedFilter.class} shadow-2xl`}
              style={computedStyle}
            />
          )}

          {/* PRO Adjustments Overlays */}
          {activeTab !== 'CROP' && (
            <>
              {/* Temperature Overlay */}
              {adjustments.temperature !== 100 && (
                <div
                  className="absolute inset-0 pointer-events-none rounded-lg mix-blend-color"
                  style={{
                    backgroundColor:
                      adjustments.temperature > 100 ? '#ff8c00' : '#0077ff',
                    opacity: Math.abs(adjustments.temperature - 100) / 300,
                  }}
                />
              )}
              {/* Vignette Overlay */}
              {adjustments.vignette > 0 && (
                <div
                  className="absolute inset-0 pointer-events-none rounded-lg"
                  style={{
                    background:
                      'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.8) 120%)',
                    opacity: adjustments.vignette / 100,
                  }}
                />
              )}
              {/* Noise Overlay */}
              {adjustments.noise > 0 && (
                <div
                  className="absolute inset-0 pointer-events-none rounded-lg mix-blend-overlay"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")`,
                    opacity: adjustments.noise / 100,
                  }}
                />
              )}

              {/* Canvas Overlay for drawing/text */}
              <div
                className="absolute"
                style={{ width: imageDims.width, height: imageDims.height }}
              >
                <CanvasOverlay
                  stageRef={stageRef}
                  width={imageDims.width}
                  height={imageDims.height}
                  overlays={overlays}
                  onChange={(newOverlays) => setOverlays(newOverlays)}
                  drawMode={drawMode}
                  brushColor={brushColor}
                  brushSize={brushSize}
                  selectedOverlayId={selectedOverlayId}
                  onSelectOverlay={setSelectedOverlayId}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Controls Area */}
      <div className="bg-zinc-900/95 backdrop-blur-xl border-t border-white/4 flex flex-col shrink-0 pb-safe">
        {/* Active Tool Control */}
        <div className="h-[120px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {activeTab === 'FILTERS' ? (
              <motion.div
                key="filters"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex overflow-x-auto items-center gap-3 px-4 no-scrollbar snap-x touch-pan-x"
              >
                {FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.name}
                    onClick={() => setSelectedFilter(filter)}
                    className="flex flex-col items-center gap-1 group min-w-[64px] snap-start"
                  >
                    <div
                      className={`w-[56px] h-[56px] rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                        selectedFilter.name === filter.name
                          ? 'border-brand-primary/50 scale-105 shadow-[0_0_15px_rgba(140, 82, 255,0.3)]'
                          : 'border-transparent opacity-60 group-hover:opacity-100'
                      }`}
                    >
                      <img
                        src={thumbnailUrl}
                        alt={filter.name}
                        className={`w-full h-full object-cover ${filter.class}`}
                      />
                    </div>
                    <span
                      className={`text-xs uppercase font-bold tracking-wider ${
                        selectedFilter.name === filter.name
                          ? 'text-brand-primary'
                          : 'text-white/30'
                      }`}
                    >
                      {filter.name}
                    </span>
                  </button>
                ))}
              </motion.div>
            ) : activeTab === 'ADJUST' ? (
              <motion.div
                key="adjust"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full max-w-sm mx-auto"
              >
                {ADJUSTMENT_CONFIG.map((adj) =>
                  activeAdjustment === adj.key ? (
                    <AdjustmentSlider
                      key={adj.key}
                      label={t(`createPost.edit.adjust.${adj.labelKey}`)}
                      value={adjustments[adj.key]}
                      defaultValue={DEFAULT_ADJUSTMENTS[adj.key]}
                      min={adj.min}
                      max={adj.max}
                      unit={adj.unit}
                      onChange={(v) =>
                        setAdjustments((p) => ({ ...p, [adj.key]: v }))
                      }
                    />
                  ) : null,
                )}
              </motion.div>
            ) : activeTab === 'TRIM' && isVideo ? (
              <motion.div
                key="trim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full max-w-sm mx-auto flex flex-col gap-4 px-4 py-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white/60">Audio</span>
                  <button
                    type="button"
                    onClick={() =>
                      setVideoData((v) => ({ ...v, muted: !v.muted }))
                    }
                    className={`p-2 rounded-lg transition-all ${
                      videoData.muted
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-brand-primary/20 text-brand-primary'
                    }`}
                  >
                    {videoData.muted ? 'Silenciado 🔇' : 'Con Sonido 🔊'}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-white/60">
                    Recortar (
                    {Math.max(
                      0,
                      videoData.endTime - videoData.startTime,
                    ).toFixed(1)}
                    s)
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-8">
                      {videoData.startTime.toFixed(1)}s
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={videoRef.current?.duration || 100}
                      step={0.1}
                      value={videoData.startTime}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val < videoData.endTime) {
                          setVideoData((v) => ({ ...v, startTime: val }));
                          if (videoRef.current)
                            videoRef.current.currentTime = val;
                        }
                      }}
                      className="flex-1 appearance-none bg-transparent cursor-pointer outline-none [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-1.5 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-white/10 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-brand-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full"
                    />
                    <input
                      type="range"
                      min={0}
                      max={videoRef.current?.duration || 100}
                      step={0.1}
                      value={videoData.endTime}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val > videoData.startTime) {
                          setVideoData((v) => ({ ...v, endTime: val }));
                          if (videoRef.current)
                            videoRef.current.currentTime = val - 0.1;
                        }
                      }}
                      className="flex-1 appearance-none bg-transparent cursor-pointer outline-none [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-1.5 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-white/10 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-red-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full"
                    />
                    <span className="text-xs w-8 text-right">
                      {videoData.endTime.toFixed(1)}s
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'CROP' ? (
              <motion.div
                key="crop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full max-w-sm mx-auto flex flex-col gap-4 px-4 py-2"
              >
                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setAspect(undefined)}
                    className={`flex-1 py-3 text-xs font-bold rounded-lg ${!aspect ? 'bg-brand-primary/20 text-brand-primary' : 'bg-white/5 text-white/60'}`}
                  >
                    Libre
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspect(1)}
                    className={`flex-1 py-3 text-xs font-bold rounded-lg ${aspect === 1 ? 'bg-brand-primary/20 text-brand-primary' : 'bg-white/5 text-white/60'}`}
                  >
                    1:1
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspect(4 / 5)}
                    className={`flex-1 py-3 text-xs font-bold rounded-lg ${aspect === 4 / 5 ? 'bg-brand-primary/20 text-brand-primary' : 'bg-white/5 text-white/60'}`}
                  >
                    4:5
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspect(16 / 9)}
                    className={`flex-1 py-3 text-xs font-bold rounded-lg ${aspect === 16 / 9 ? 'bg-brand-primary/20 text-brand-primary' : 'bg-white/5 text-white/60'}`}
                  >
                    16:9
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-white/40 uppercase">
                    Rotación
                  </span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="flex-1 appearance-none bg-transparent cursor-pointer outline-none [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-1.5 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-white/10 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-brand-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full"
                  />
                  <span className="text-xs font-bold text-brand-primary w-8">
                    {rotation}°
                  </span>
                </div>
              </motion.div>
            ) : activeTab === 'OVERLAY' ? (
              <motion.div
                key="overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full max-w-sm mx-auto flex flex-col gap-4 px-4 py-2"
              >
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setDrawMode(!drawMode)}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                      drawMode
                        ? 'bg-brand-primary text-white shadow-[0_0_15px_rgba(140, 82, 255,0.3)]'
                        : 'bg-white/5 text-white/60 hover:text-white'
                    }`}
                  >
                    {drawMode ? 'Dibujando...' : 'Dibujar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawMode(false);
                      const newId = Math.random().toString(36).substr(2, 9);
                      setOverlays([
                        ...overlays,
                        {
                          id: newId,
                          type: 'text',
                          x: 50,
                          y: 50,
                          text: 'Nuevo Texto',
                          fill: brushColor,
                          fontSize: 30,
                        },
                      ]);
                    }}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-white/5 text-white/60 hover:text-white transition-all"
                  >
                    + Texto
                  </button>
                  {selectedOverlayId && (
                    <button
                      type="button"
                      onClick={() => {
                        setOverlays(
                          overlays.filter((o) => o.id !== selectedOverlayId),
                        );
                        setSelectedOverlayId(null);
                      }}
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center gap-1"
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                  )}
                </div>
                <div className="flex gap-2 justify-center">
                  {['🔥', '❤️', '✨', '😂', '😎'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setDrawMode(false);
                        const newId = Math.random().toString(36).substr(2, 9);
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
                      className="text-2xl hover:scale-110 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                {drawMode && (
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(e) => setBrushColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                    />
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="flex-1 appearance-none bg-transparent cursor-pointer outline-none [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-1.5 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-white/10 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-brand-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full"
                    />
                  </div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Tab Switcher & Sub-menu */}
        <div className="flex flex-col border-t border-white/3">
          {/* Adjustment Selector */}
          <AnimatePresence>
            {activeTab === 'ADJUST' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex overflow-x-auto py-2 border-b border-white/3 no-scrollbar px-2">
                  {ADJUSTMENT_CONFIG.map((adj) => {
                    const isActive = activeAdjustment === adj.key;
                    const isModified =
                      adjustments[adj.key] !== DEFAULT_ADJUSTMENTS[adj.key];
                    return (
                      <button
                        type="button"
                        key={adj.key}
                        onClick={() => setActiveAdjustment(adj.key)}
                        className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider whitespace-nowrap rounded-lg transition-all ${
                          isActive
                            ? 'text-white bg-white/6'
                            : isModified
                              ? 'text-brand-primary/80 hover:text-brand-primary'
                              : 'text-white/20 hover:text-white/40'
                        }`}
                      >
                        {t(`createPost.edit.adjust.${adj.labelKey}`)}
                        {isModified && !isActive && (
                          <span className="ml-1 w-1 h-1 bg-brand-primary rounded-full inline-block" />
                        )}
                      </button>
                    );
                  })}

                  {isAdjusted && (
                    <button
                      type="button"
                      onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
                      className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider whitespace-nowrap 
                                 text-red-400/60 hover:text-red-400 ml-auto flex items-center gap-1 transition-colors"
                    >
                      <RotateCcw size={10} /> Reset
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Tabs */}
          <div className="flex w-full items-stretch justify-between px-2 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('FILTERS')}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all rounded-xl ${
                activeTab === 'FILTERS'
                  ? 'text-white bg-white/10'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles size={20} />
              <span className="text-xs font-bold uppercase tracking-wider">
                Filters
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ADJUST')}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all rounded-xl ${
                activeTab === 'ADJUST'
                  ? 'text-white bg-white/10'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <SlidersHorizontal size={20} />
              <span className="text-xs font-bold uppercase tracking-wider">
                Adjust
              </span>
            </button>
            {!isVideo && (
              <button
                type="button"
                onClick={() => setActiveTab('CROP')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all rounded-xl ${
                  activeTab === 'CROP'
                    ? 'text-brand-primary bg-brand-primary/10'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                <Crop size={20} />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Crop
                </span>
              </button>
            )}

            {isVideo && (
              <button
                type="button"
                onClick={() => setActiveTab('TRIM')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all rounded-xl ${
                  activeTab === 'TRIM'
                    ? 'text-brand-primary bg-brand-primary/10'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                <Crop size={20} />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Trim
                </span>
              </button>
            )}

            {!isVideo && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('OVERLAY');
                  setDrawMode(false);
                }}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all rounded-xl ${
                  activeTab === 'OVERLAY'
                    ? 'text-brand-primary bg-brand-primary/10'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                <Sparkles size={20} />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Overlay
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
