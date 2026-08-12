import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Move,
  RotateCw,
  Sliders,
  Sparkles,
  Type as TypeIcon,
  Volume2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useStudioStore } from '../../../stores/studioStore';
import type { MediaClip, TextClip } from '../../../types/studio';

export default function PropertiesPanel() {
  const { project, selectedClipId, selectClip, updateClip } = useStudioStore();
  const [tab, setTab] = useState<'transform' | 'style' | 'audio'>('transform');

  const selectedClip = project?.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId);

  if (!selectedClip) return null;

  const isText = selectedClip.type === 'text';
  const isMedia =
    selectedClip.type === 'video' || selectedClip.type === 'image';
  const isAudio = selectedClip.type === 'audio';

  const transform = selectedClip.transform || {
    scale: 1,
    rotation: 0,
    x: 0,
    y: 0,
  };

  const handleTransformChange = (
    key: keyof typeof transform,
    value: number,
  ) => {
    updateClip(selectedClip.id, {
      transform: { ...transform, [key]: value },
    } as any);
  };

  return (
    <div className="bg-[#121216]/95 border-b lg:border-b-0 lg:border-l border-white/10 p-3 sm:p-4 flex flex-col lg:w-72 xl:w-80 shrink-0 gap-3 overflow-y-auto h-full z-20 shadow-2xl no-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Sliders size={16} className="text-brand-primary" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Propiedades ({selectedClip.type})
          </span>
        </div>
        <button
          type="button"
          onClick={() => selectClip(null)}
          className="w-11 h-11 md:w-8 md:h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all"
        >
          <X size={16} />
        </button>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="flex items-center justify-around bg-black/40 p-1 rounded-xl border border-white/5">
        <button
          type="button"
          onClick={() => setTab('transform')}
          className={`flex-1 min-h-11 md:min-h-0 md:py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
            tab === 'transform'
              ? 'bg-brand-primary text-white shadow-sm'
              : 'text-white/50 hover:text-white'
          }`}
        >
          <Move size={12} />
          <span>Transformar</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('style')}
          className={`flex-1 min-h-11 md:min-h-0 md:py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
            tab === 'style'
              ? 'bg-brand-primary text-white shadow-sm'
              : 'text-white/50 hover:text-white'
          }`}
        >
          {isText ? <TypeIcon size={12} /> : <Sparkles size={12} />}
          <span>{isText ? 'Texto' : 'Filtros'}</span>
        </button>

        {(isMedia || isAudio) && (
          <button
            type="button"
            onClick={() => setTab('audio')}
            className={`flex-1 min-h-11 md:min-h-0 md:py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
              tab === 'audio'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <Volume2 size={12} />
            <span>Audio & Speed</span>
          </button>
        )}
      </div>

      {/* TAB 1: TRANSFORMAR */}
      {tab === 'transform' && (
        <div className="flex flex-col gap-4">
          {/* Scale / Zoom */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-white/70">
              <span className="flex items-center gap-1 font-medium">
                <Maximize2 size={13} className="text-brand-primary" /> Escala
              </span>
              <span className="font-mono text-[11px] text-white/40">
                {Math.round(transform.scale * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="3"
              step="0.05"
              value={transform.scale}
              onChange={(e) =>
                handleTransformChange('scale', parseFloat(e.target.value))
              }
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
            />
          </div>

          {/* Rotation */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-white/70">
              <span className="flex items-center gap-1 font-medium">
                <RotateCw size={13} className="text-brand-primary" /> Rotación
              </span>
              <span className="font-mono text-[11px] text-white/40">
                {transform.rotation}°
              </span>
            </div>
            <input
              type="range"
              min="-180"
              max="180"
              step="5"
              value={transform.rotation}
              onChange={(e) =>
                handleTransformChange('rotation', parseInt(e.target.value, 10))
              }
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
            />
          </div>

          {/* Posición X / Y */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-white/60 font-medium">
                Posición X
              </span>
              <input
                type="number"
                value={transform.x}
                onChange={(e) =>
                  handleTransformChange('x', parseInt(e.target.value, 10) || 0)
                }
                className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-white/60 font-medium">
                Posición Y
              </span>
              <input
                type="number"
                value={transform.y}
                onChange={(e) =>
                  handleTransformChange('y', parseInt(e.target.value, 10) || 0)
                }
                className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          {/* Opacidad & Flips */}
          {isMedia && (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-white/70">
                  <span className="font-medium">Opacidad</span>
                  <span className="font-mono text-[11px] text-white/40">
                    {Math.round(
                      ((selectedClip as MediaClip).opacity ?? 1) * 100,
                    )}
                    %
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={(selectedClip as MediaClip).opacity ?? 1}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      opacity: parseFloat(e.target.value),
                    } as any)
                  }
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                <span className="text-xs text-white/70 font-medium">
                  Espejar
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      updateClip(selectedClip.id, {
                        flipX: !(selectedClip as MediaClip).flipX,
                      } as any)
                    }
                    className={`p-2 rounded-xl border transition-all ${
                      (selectedClip as MediaClip).flipX
                        ? 'bg-brand-primary border-brand-primary text-white'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                    }`}
                    title="Invertir Horizontalmente"
                  >
                    <FlipHorizontal size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateClip(selectedClip.id, {
                        flipY: !(selectedClip as MediaClip).flipY,
                      } as any)
                    }
                    className={`p-2 rounded-xl border transition-all ${
                      (selectedClip as MediaClip).flipY
                        ? 'bg-brand-primary border-brand-primary text-white'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                    }`}
                    title="Invertir Verticalmente"
                  >
                    <FlipVertical size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: ESTILO / FILTROS */}
      {tab === 'style' && (
        <div className="flex flex-col gap-4">
          {isText && (
            <>
              {/* Text Input */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-white/80">
                  Contenido del Texto
                </span>
                <textarea
                  value={(selectedClip as TextClip).content}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      content: e.target.value,
                    } as any)
                  }
                  className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white w-full outline-none focus:border-brand-primary transition-all resize-none h-16"
                  placeholder="Escribe aquí..."
                />
              </div>

              {/* Text Align */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/70 font-medium">
                  Alineación
                </span>
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                  {[
                    { align: 'left', icon: AlignLeft },
                    { align: 'center', icon: AlignCenter },
                    { align: 'right', icon: AlignRight },
                  ].map((a) => {
                    const Icon = a.icon;
                    const isActive =
                      (selectedClip as TextClip).style.textAlign === a.align;
                    return (
                      <button
                        key={a.align}
                        type="button"
                        onClick={() => {
                          const currentStyle = (selectedClip as TextClip).style;
                          updateClip(selectedClip.id, {
                            style: {
                              ...currentStyle,
                              textAlign: a.align as any,
                            },
                          } as any);
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-brand-primary text-white'
                            : 'text-white/40 hover:text-white'
                        }`}
                      >
                        <Icon size={14} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Size */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-white/70">
                  <span>Tamaño de Letra</span>
                  <span className="font-mono text-white/40">
                    {(selectedClip as TextClip).style.fontSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="120"
                  value={(selectedClip as TextClip).style.fontSize}
                  onChange={(e) => {
                    const currentStyle = (selectedClip as TextClip).style;
                    updateClip(selectedClip.id, {
                      style: {
                        ...currentStyle,
                        fontSize: parseInt(e.target.value, 10),
                      },
                    } as any);
                  }}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                />
              </div>

              {/* Colors: Text & Background */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-white/60 font-medium">
                    Color Texto
                  </span>
                  <input
                    type="color"
                    value={(selectedClip as TextClip).style.color || '#ffffff'}
                    onChange={(e) => {
                      const currentStyle = (selectedClip as TextClip).style;
                      updateClip(selectedClip.id, {
                        style: { ...currentStyle, color: e.target.value },
                      } as any);
                    }}
                    className="w-full h-9 rounded-xl cursor-pointer bg-white/5 border border-white/10 p-1"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-white/60 font-medium">
                    Fondo Caja
                  </span>
                  <input
                    type="color"
                    value={
                      (selectedClip as TextClip).style.backgroundColor ===
                      'transparent'
                        ? '#000000'
                        : (selectedClip as TextClip).style.backgroundColor ||
                          '#000000'
                    }
                    onChange={(e) => {
                      const currentStyle = (selectedClip as TextClip).style;
                      updateClip(selectedClip.id, {
                        style: {
                          ...currentStyle,
                          backgroundColor: e.target.value,
                        },
                      } as any);
                    }}
                    className="w-full h-9 rounded-xl cursor-pointer bg-white/5 border border-white/10 p-1"
                  />
                </div>
              </div>
            </>
          )}

          {isMedia && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-white/80">
                Filtros Visuales
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Ninguno', value: '' },
                  { label: 'Cine B&W', value: 'grayscale(1) contrast(1.2)' },
                  { label: 'Sepia', value: 'sepia(0.9)' },
                  {
                    label: 'Cyber Neón',
                    value: 'hue-rotate(90deg) saturate(1.8)',
                  },
                  { label: 'Invertir', value: 'invert(1)' },
                  { label: 'Alto Contraste', value: 'contrast(1.6)' },
                ].map((filter) => (
                  <button
                    key={filter.label}
                    type="button"
                    onClick={() =>
                      updateClip(selectedClip.id, {
                        filter: filter.value,
                      } as any)
                    }
                    className={`px-2 py-2 text-[11px] font-semibold rounded-xl border transition-all ${
                      (selectedClip as MediaClip).filter === filter.value ||
                      (!filter.value && !(selectedClip as MediaClip).filter)
                        ? 'bg-brand-primary border-brand-primary text-white shadow-md'
                        : 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUDIO & VELOCIDAD */}
      {tab === 'audio' && (isMedia || isAudio) && (
        <div className="flex flex-col gap-4">
          {/* Volume Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-white/70">
              <span className="font-medium">Volumen</span>
              <span className="font-mono text-white/40">
                {Math.round(((selectedClip as MediaClip).volume ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={(selectedClip as MediaClip).volume ?? 1}
              onChange={(e) =>
                updateClip(selectedClip.id, {
                  volume: parseFloat(e.target.value),
                } as any)
              }
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
            />
          </div>

          {/* Speed Presets */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-white/80">
              Velocidad
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {[0.5, 1.0, 1.5, 2.0].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    updateClip(selectedClip.id, { speed: s } as any)
                  }
                  className={`py-1.5 text-xs font-bold rounded-xl border transition-all ${
                    ((selectedClip as MediaClip).speed ?? 1) === s
                      ? 'bg-brand-primary border-brand-primary text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
