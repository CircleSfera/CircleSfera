import { AnimatePresence, motion } from 'framer-motion';
import { Check, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Crop } from 'lucide-react';

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
}

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sepia: 0,
  grayscale: 0,
  hue: 0,
  blur: 0,
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

interface PhotoEditorProps {
  image: File;
  onSave: (file: File, filter: string, cropData?: CropData) => void;
  onCancel: () => void;
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
          className="w-full h-1 bg-white/6 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>
    </motion.div>
  );
};

export default function PhotoEditor({
  image,
  onSave,
  onCancel,
}: PhotoEditorProps) {
  const [activeTab, setActiveTab] = useState<'FILTERS' | 'ADJUST' | 'CROP'>('FILTERS');
  const [selectedFilter, setSelectedFilter] = useState(FILTERS[0]);
  const [adjustments, setAdjustments] =
    useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [activeAdjustment, setActiveAdjustment] =
    useState<keyof Adjustments>('brightness');

  // Crop state
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(undefined); // Freeform
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropData | null>(null);

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels({ ...croppedAreaPixels, rotation });
  }, [rotation]);

  const [previewUrl] = useState(URL.createObjectURL(image));
  const [thumbnailUrl, setThumbnailUrl] = useState<string>(previewUrl);
  const isVideo = image.type.startsWith('video');

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
      };
      video.onseeked = () => {
        captureFrame();
      };
    }
  }, [previewUrl, isVideo]);

  const computedStyle = useMemo(() => {
    return {
      filter: `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) sepia(${adjustments.sepia}%) grayscale(${adjustments.grayscale}%) hue-rotate(${adjustments.hue}deg) blur(${adjustments.blur}px)`,
    };
  }, [adjustments]);

  const handleSave = () => {
    const filterString = `filter-class:${selectedFilter.class}__style:${computedStyle.filter}`;
    onSave(image, filterString, croppedAreaPixels || undefined);
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
        <button
          type="button"
          onClick={handleSave}
          className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-xl transition-all"
        >
          <Check size={20} />
        </button>
      </div>

      {/* Preview Area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-zinc-950 min-h-0">
        <div className="absolute inset-0 bg-radial-[at_50%_50%] from-white/1 via-transparent to-transparent pointer-events-none" />
        <div className="relative w-full h-full flex items-center justify-center p-4">
          {isVideo ? (
            <video
              src={previewUrl}
              className={`max-w-full max-h-full object-contain rounded-lg ${selectedFilter.class}`}
              style={computedStyle}
              controls={false}
              playsInline
              loop
              autoPlay
              muted
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
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
          ) : (
            <img
              src={previewUrl}
              alt="Preview"
              className={`max-w-full max-h-full object-contain rounded-lg ${selectedFilter.class}`}
              style={computedStyle}
            />
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
                className="flex overflow-x-auto items-center gap-3 px-4 no-scrollbar"
              >
                {FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.name}
                    onClick={() => setSelectedFilter(filter)}
                    className="flex flex-col items-center gap-1.5 group min-w-[64px]"
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
                  <button type="button" onClick={() => setAspect(undefined)} className={`flex-1 py-2 text-xs font-bold rounded-lg ${!aspect ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/60'}`}>Libre</button>
                  <button type="button" onClick={() => setAspect(1)} className={`flex-1 py-2 text-xs font-bold rounded-lg ${aspect === 1 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/60'}`}>1:1</button>
                  <button type="button" onClick={() => setAspect(4 / 5)} className={`flex-1 py-2 text-xs font-bold rounded-lg ${aspect === 4 / 5 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/60'}`}>4:5</button>
                  <button type="button" onClick={() => setAspect(16 / 9)} className={`flex-1 py-2 text-xs font-bold rounded-lg ${aspect === 16 / 9 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/60'}`}>16:9</button>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-white/40 uppercase">Rotación</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="flex-1 h-1 bg-white/6 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-[10px] font-bold text-blue-400 w-8">{rotation}°</span>
                </div>
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
          <div className="flex h-11">
            <button
              type="button"
              onClick={() => setActiveTab('FILTERS')}
              className={`flex-1 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
                activeTab === 'FILTERS'
                  ? 'text-white bg-white/3'
                  : 'text-white/25 hover:text-white/40'
              }`}
            >
              <Sparkles size={13} />
              Filters
            </button>
            <div className="w-px bg-white/4" />
            <button
              type="button"
              onClick={() => setActiveTab('ADJUST')}
              className={`flex-1 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
                activeTab === 'ADJUST'
                  ? 'text-white bg-white/3'
                  : 'text-white/25 hover:text-white/40'
              }`}
            >
              <SlidersHorizontal size={13} />
              Adjust
            </button>
            <div className="w-px bg-white/4" />
            <button
              type="button"
              onClick={() => setActiveTab('CROP')}
              className={`flex-1 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
                activeTab === 'CROP'
                  ? 'text-white bg-white/3'
                  : 'text-white/25 hover:text-white/40'
              }`}
            >
              <Crop size={13} />
              Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
