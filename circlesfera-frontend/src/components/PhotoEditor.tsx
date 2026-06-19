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
import type { OverlayElement } from '../services/edits.service';
import CanvasOverlay from './CanvasOverlay';

const FILTERS = [
  { name: 'Normal', class: '' },
  { name: 'Clarendon', class: 'brightness-110 contrast-125 saturate-125' },
  { name: 'Gingham', class: 'brightness-105 hue-rotate-350 contrast-90' },
  { name: 'Moon', class: 'grayscale brightness-110 contrast-110' },
  {
    name: 'Lark',
    class: 'brightness-105 contrast-90 saturate-125 sepia-[.15]',
  },
  {
    name: 'Reyes',
    class: 'sepia-[.20] brightness-110 contrast-85 saturate-75',
  },
  {
    name: 'Juno',
    class: 'contrast-115 brightness-115 saturate-140 sepia-[.15]',
  },
  { name: 'Slumber', class: 'brightness-105 saturate-65 sepia-[.20]' },
  { name: 'Crema', class: 'sepia-[.25] contrast-125 brightness-115' },
  { name: 'Ludwig', class: 'sepia-[.10] saturate-200 brightness-105' },
  {
    name: 'Aden',
    class: 'sepia-[.20] brightness-120 saturate-85 hue-rotate-340',
  },
  { name: 'Perpetua', class: 'contrast-110 brightness-125 saturate-110' },
];

interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  sepia: number;
  grayscale: number;
  hue: number;
  blur: number;
  temperature: number;
  vignette: number;
  noise: number;
}

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sepia: 0,
  grayscale: 0,
  hue: 0,
  blur: 0,
  temperature: 100,
  vignette: 0,
  noise: 0,
};

const ADJUSTMENT_CONFIG: {
  key: keyof Adjustments;
  label: string;
  min: number;
  max: number;
  unit: string;
}[] = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 200, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200, unit: '%' },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
  { key: 'temperature', label: 'Temperature', min: 0, max: 200, unit: '%' },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100, unit: '%' },
  { key: 'noise', label: 'Noise / Grain', min: 0, max: 100, unit: '%' },
  { key: 'blur', label: 'Blur', min: 0, max: 10, unit: 'px' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, unit: '%' },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, unit: '%' },
];

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
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.12em]">
        <span className="text-white/30">{label}</span>
        <span className={isModified ? 'text-blue-400' : 'text-white/20'}>
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
          className="w-full h-1 bg-white/6 rounded-lg appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
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
  }, []); // re-calculate when tabs change

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
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-white/6 bg-black z-10">
        <button
          type="button"
          onClick={onCancel}
          className="p-2 hover:bg-white/6 rounded-xl transition-colors text-white/60 hover:text-white"
        >
          <X size={20} />
        </button>
        <div className="text-sm font-bold tracking-tight text-white/80">
          Edit
        </div>
        <div className="flex items-center gap-2">
          {onApplyToAll && (
            <button
              type="button"
              onClick={() => {
                const filterString = `filter-class:${selectedFilter.class}__style:${computedStyle.filter}__temp:${adjustments.temperature}__vignette:${adjustments.vignette}__noise:${adjustments.noise}`;
                onApplyToAll(filterString);
              }}
              className="px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
              Aplicar a Todos
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-xl transition-all"
          >
            <Check size={20} />
          </button>
        </div>
      </div>

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
                    className="flex flex-col items-center gap-1.5 group min-w-[64px] snap-start"
                  >
                    <div
                      className={`w-[56px] h-[56px] rounded-2xl overflow-hidden border-2 transition-all duration-200 ${
                        selectedFilter.name === filter.name
                          ? 'border-blue-500 scale-105 shadow-lg shadow-blue-500/20'
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
                      className={`text-[9px] uppercase font-bold tracking-wider ${
                        selectedFilter.name === filter.name
                          ? 'text-blue-400'
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
                      label={adj.label}
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
                        : 'bg-blue-500/20 text-blue-400'
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
                    <span className="text-[10px] w-8">
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
                      className="flex-1 h-1 bg-blue-500/30 rounded-lg appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
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
                      className="flex-1 h-1 bg-red-500/30 rounded-lg appearance-none cursor-pointer accent-red-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
                    />
                    <span className="text-[10px] w-8 text-right">
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
                    className={`flex-1 py-3 text-xs font-bold rounded-lg ${!aspect ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/60'}`}
                  >
                    Libre
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspect(1)}
                    className={`flex-1 py-3 text-xs font-bold rounded-lg ${aspect === 1 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/60'}`}
                  >
                    1:1
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspect(4 / 5)}
                    className={`flex-1 py-3 text-xs font-bold rounded-lg ${aspect === 4 / 5 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/60'}`}
                  >
                    4:5
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspect(16 / 9)}
                    className={`flex-1 py-3 text-xs font-bold rounded-lg ${aspect === 16 / 9 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/60'}`}
                  >
                    16:9
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-white/40 uppercase">
                    Rotación
                  </span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="flex-1 h-1 bg-white/6 rounded-lg appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
                  />
                  <span className="text-[10px] font-bold text-blue-400 w-8">
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
                        ? 'bg-blue-500 text-white'
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
                      className="flex-1 h-1 bg-white/6 rounded-lg appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
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
                        className={`px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap rounded-lg transition-all ${
                          isActive
                            ? 'text-white bg-white/6'
                            : isModified
                              ? 'text-blue-400/60 hover:text-blue-400'
                              : 'text-white/20 hover:text-white/40'
                        }`}
                      >
                        {adj.label}
                        {isModified && !isActive && (
                          <span className="ml-1 w-1 h-1 bg-blue-400 rounded-full inline-block" />
                        )}
                      </button>
                    );
                  })}

                  {isAdjusted && (
                    <button
                      type="button"
                      onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
                      className="px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap 
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
              <span className="text-[10px] font-bold uppercase tracking-wider">
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
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Adjust
              </span>
            </button>
            {!isVideo && (
              <button
                type="button"
                onClick={() => setActiveTab('CROP')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all rounded-xl ${
                  activeTab === 'CROP'
                    ? 'text-blue-400 bg-blue-500/20'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                <Crop size={20} />
                <span className="text-[10px] font-bold uppercase tracking-wider">
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
                    ? 'text-blue-400 bg-blue-500/20'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                <Crop size={20} />
                <span className="text-[10px] font-bold uppercase tracking-wider">
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
                    ? 'text-blue-400 bg-blue-500/20'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                <Sparkles size={20} />
                <span className="text-[10px] font-bold uppercase tracking-wider">
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
