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
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { MediaClip, TextClip } from '../../../types/studio';

export default function PropertiesPanel() {
  const { t } = useTranslation();
  const {
    project,
    selectedClipId,
    selectClip,
    updateClip,
    beginHistoryTransaction,
  } = useStudioStore();
  const [tab, setTab] = useState<'transform' | 'style' | 'audio'>('transform');

  const selectedClip = project?.tracks
    .flatMap((tr) => tr.clips)
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

  const commitContinuous = () => beginHistoryTransaction();

  const handleTransformChange = (
    key: keyof typeof transform,
    value: number,
  ) => {
    updateClip(selectedClip.id, {
      transform: { ...transform, [key]: value },
    } as Partial<typeof selectedClip>);
  };

  const filters = [
    { key: 'normal', value: '' },
    { key: 'bw', value: 'grayscale(1) contrast(1.2)' },
    { key: 'sepia', value: 'sepia(0.8) contrast(1.1)' },
    { key: 'neon', value: 'hue-rotate(90deg) saturate(1.8)' },
    { key: 'drama', value: 'contrast(1.5) saturate(1.3)' },
    { key: 'invert', value: 'invert(0.9)' },
  ] as const;

  return (
    <div className="flex flex-col gap-3 overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Sliders size={16} className="text-brand-primary" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            {t(
              `studio.tracks.${selectedClip.type === 'image' ? 'video' : selectedClip.type === 'text' ? 'text' : selectedClip.type === 'audio' ? 'audio' : 'video'}`,
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => selectClip(null)}
          className="min-h-11 min-w-11 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all"
          aria-label={t('studio.properties.close')}
        >
          <X size={16} />
        </button>
      </div>

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
          <span>{t('studio.properties.tabs.transform')}</span>
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
          <span>
            {isText
              ? t('studio.properties.tabs.text')
              : t('studio.properties.tabs.filters')}
          </span>
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
            <span>{t('studio.properties.tabs.audio')}</span>
          </button>
        )}
      </div>

      {tab === 'transform' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-white/70">
              <span className="flex items-center gap-1 font-medium">
                <Maximize2 size={13} className="text-brand-primary" />{' '}
                {t('studio.properties.scale')}
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
              onPointerDown={commitContinuous}
              onChange={(e) =>
                handleTransformChange('scale', parseFloat(e.target.value))
              }
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-white/70">
              <span className="flex items-center gap-1 font-medium">
                <RotateCw size={13} className="text-brand-primary" />{' '}
                {t('studio.properties.rotation')}
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
              onPointerDown={commitContinuous}
              onChange={(e) =>
                handleTransformChange('rotation', parseInt(e.target.value, 10))
              }
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-white/60 font-medium">
                {t('studio.properties.position_x')}
              </span>
              <input
                type="number"
                value={transform.x}
                onFocus={commitContinuous}
                onChange={(e) =>
                  handleTransformChange('x', parseInt(e.target.value, 10) || 0)
                }
                className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-white/60 font-medium">
                {t('studio.properties.position_y')}
              </span>
              <input
                type="number"
                value={transform.y}
                onFocus={commitContinuous}
                onChange={(e) =>
                  handleTransformChange('y', parseInt(e.target.value, 10) || 0)
                }
                className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          {isMedia && (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-white/70">
                  <span className="font-medium">
                    {t('studio.properties.opacity')}
                  </span>
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
                  onPointerDown={commitContinuous}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      opacity: parseFloat(e.target.value),
                    } as Partial<MediaClip>)
                  }
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                <span className="text-xs text-white/70 font-medium">
                  {t('studio.properties.flip')}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      updateClip(
                        selectedClip.id,
                        {
                          flipX: !(selectedClip as MediaClip).flipX,
                        } as Partial<MediaClip>,
                        { history: true },
                      )
                    }
                    className={`p-2 rounded-xl border transition-all min-h-11 min-w-11 flex items-center justify-center ${
                      (selectedClip as MediaClip).flipX
                        ? 'bg-brand-primary border-brand-primary text-white'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                    }`}
                    title={t('studio.properties.flip_h')}
                  >
                    <FlipHorizontal size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateClip(
                        selectedClip.id,
                        {
                          flipY: !(selectedClip as MediaClip).flipY,
                        } as Partial<MediaClip>,
                        { history: true },
                      )
                    }
                    className={`p-2 rounded-xl border transition-all min-h-11 min-w-11 flex items-center justify-center ${
                      (selectedClip as MediaClip).flipY
                        ? 'bg-brand-primary border-brand-primary text-white'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                    }`}
                    title={t('studio.properties.flip_v')}
                  >
                    <FlipVertical size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'style' && (
        <div className="flex flex-col gap-4">
          {isText && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-white/80">
                  {t('studio.properties.text_content')}
                </span>
                <textarea
                  value={(selectedClip as TextClip).content}
                  onFocus={commitContinuous}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      content: e.target.value,
                    } as Partial<TextClip>)
                  }
                  className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white w-full outline-none focus:border-brand-primary transition-all resize-none h-16"
                  placeholder={t('studio.properties.text_placeholder')}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-white/70 font-medium">
                  {t('studio.properties.align')}
                </span>
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                  {[
                    { align: 'left' as const, icon: AlignLeft },
                    { align: 'center' as const, icon: AlignCenter },
                    { align: 'right' as const, icon: AlignRight },
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
                          updateClip(
                            selectedClip.id,
                            {
                              style: {
                                ...currentStyle,
                                textAlign: a.align,
                              },
                            } as Partial<TextClip>,
                            { history: true },
                          );
                        }}
                        className={`p-1.5 rounded-lg transition-colors min-h-11 min-w-11 flex items-center justify-center ${
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

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-white/70">
                  <span>{t('studio.properties.font_size')}</span>
                  <span className="font-mono text-white/40">
                    {(selectedClip as TextClip).style.fontSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="120"
                  value={(selectedClip as TextClip).style.fontSize}
                  onPointerDown={commitContinuous}
                  onChange={(e) => {
                    const currentStyle = (selectedClip as TextClip).style;
                    updateClip(selectedClip.id, {
                      style: {
                        ...currentStyle,
                        fontSize: parseInt(e.target.value, 10),
                      },
                    } as Partial<TextClip>);
                  }}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-white/60 font-medium">
                    {t('studio.properties.text_color')}
                  </span>
                  <input
                    type="color"
                    value={(selectedClip as TextClip).style.color || '#ffffff'}
                    onFocus={commitContinuous}
                    onChange={(e) => {
                      const currentStyle = (selectedClip as TextClip).style;
                      updateClip(selectedClip.id, {
                        style: { ...currentStyle, color: e.target.value },
                      } as Partial<TextClip>);
                    }}
                    className="w-full h-9 rounded-xl cursor-pointer bg-white/5 border border-white/10 p-1"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-white/60 font-medium">
                    {t('studio.properties.box_bg')}
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
                    onFocus={commitContinuous}
                    onChange={(e) => {
                      const currentStyle = (selectedClip as TextClip).style;
                      updateClip(selectedClip.id, {
                        style: {
                          ...currentStyle,
                          backgroundColor: e.target.value,
                        },
                      } as Partial<TextClip>);
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
                {t('studio.filters.title')}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {filters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() =>
                      updateClip(
                        selectedClip.id,
                        { filter: filter.value } as Partial<MediaClip>,
                        { history: true },
                      )
                    }
                    className={`px-2 py-2 text-[11px] font-semibold rounded-xl border transition-all min-h-11 ${
                      (selectedClip as MediaClip).filter === filter.value ||
                      (!filter.value && !(selectedClip as MediaClip).filter)
                        ? 'bg-brand-primary border-brand-primary text-white shadow-md'
                        : 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {t(`studio.filters.${filter.key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'audio' && (isMedia || isAudio) && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-white/70">
              <span className="font-medium">
                {t('studio.properties.volume')}
              </span>
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
              onPointerDown={commitContinuous}
              onChange={(e) =>
                updateClip(selectedClip.id, {
                  volume: parseFloat(e.target.value),
                } as Partial<MediaClip>)
              }
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-white/80">
              {t('studio.properties.speed')}
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {[0.5, 1.0, 1.5, 2.0].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    updateClip(
                      selectedClip.id,
                      { speed: s } as Partial<MediaClip>,
                      { history: true },
                    )
                  }
                  className={`py-1.5 text-xs font-bold rounded-xl border transition-all min-h-11 ${
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
