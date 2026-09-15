import { Image as ImageIcon } from 'lucide-react';
import type { CSSProperties, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import { logger } from '../../utils/logger';
import DraggableStoryElement from './DraggableStoryElement';
import { StoryCanvas, type StoryCanvasRef } from './Editor/StoryCanvas';
import StorySafeGuides from './StorySafeGuides';
import StoryTextTakeoverEditor from './StoryTextTakeoverEditor';
import type { StoryComposerTab } from './storyComposer.types';

export interface StoryComposerStageProps {
  stagePadClass: string;
  cardSizeClass: string;
  panelOpen: boolean;
  textTakeoverActive: boolean;
  textTakeover: 'create' | 'edit' | null;
  containerRef: RefObject<HTMLDivElement | null>;
  storyCanvasRef: RefObject<StoryCanvasRef | null>;
  bgStyle: string;
  backgroundUrl: string | null;
  background: File | null;
  bgBlur: number;
  bgDarken: number;
  brushColor: string;
  brushWidth: number;
  activeTab: StoryComposerTab;
  elements: StoryElement[];
  selectedElementId: string | null;
  draggingLayer: boolean;
  showVGuide: boolean;
  showHGuide: boolean;
  textEditorRef: RefObject<HTMLDivElement | null>;
  textInput: string;
  textStyle: StoryElement['textStyle'];
  textAlign: 'left' | 'center' | 'right';
  textWidth: number;
  takeoverPreviewCss: CSSProperties;
  setSelectedElementId: (id: string | null) => void;
  setActiveTab: (tab: StoryComposerTab) => void;
  updateElement: (id: string, updates: Partial<StoryElement>) => void;
  setDraggingLayer: (v: boolean) => void;
  setShowVGuide: (v: boolean) => void;
  setShowHGuide: (v: boolean) => void;
  openTextEdit: (el: StoryElement) => void;
  setTextInput: (v: string) => void;
}

/** 9:16 export surface + layers (letterbox lives outside). */
export default function StoryComposerStage(p: StoryComposerStageProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-zinc-950 px-4 md:px-10 transition-[padding] duration-200 ${p.stagePadClass}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !p.textTakeoverActive) {
          p.setSelectedElementId(null);
        }
      }}
    >
      <div
        ref={p.containerRef}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget && !p.textTakeoverActive) {
            p.setSelectedElementId(null);
          }
        }}
        className={`relative aspect-9/16 shrink-0 overflow-hidden bg-black transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] rounded-4xl border border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.55)] ${p.cardSizeClass}`}
        style={{
          ...(p.bgStyle?.startsWith('linear-gradient') ||
          p.bgStyle?.startsWith('radial-gradient')
            ? { backgroundImage: p.bgStyle }
            : { backgroundColor: p.bgStyle || 'black' }),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {p.backgroundUrl &&
          (p.background?.type.startsWith('video/') ? (
            <video
              src={p.backgroundUrl}
              crossOrigin={
                p.backgroundUrl.startsWith('blob:') ||
                p.backgroundUrl.startsWith('data:')
                  ? undefined
                  : 'anonymous'
              }
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              style={{
                filter:
                  p.bgBlur > 0 || p.bgDarken > 0
                    ? `blur(${p.bgBlur}px) brightness(${100 - p.bgDarken}%)`
                    : undefined,
              }}
            />
          ) : (
            <img
              src={p.backgroundUrl}
              crossOrigin={
                p.backgroundUrl.startsWith('blob:') ||
                p.backgroundUrl.startsWith('data:')
                  ? undefined
                  : 'anonymous'
              }
              className="w-full h-full object-cover"
              alt=""
              onLoad={() => logger.log('Background image loaded in editor')}
              style={{
                filter:
                  p.bgBlur > 0 || p.bgDarken > 0
                    ? `blur(${p.bgBlur}px) brightness(${100 - p.bgDarken}%)`
                    : undefined,
              }}
            />
          ))}

        <StoryCanvas
          ref={p.storyCanvasRef}
          isDrawingMode={p.activeTab === 'draw'}
          brushColor={p.brushColor}
          brushWidth={p.brushWidth}
        />

        {p.bgDarken > 0 && !p.backgroundUrl && (
          <div
            className="absolute inset-0 bg-black pointer-events-none"
            style={{ opacity: p.bgDarken / 100 }}
          />
        )}

        {p.textTakeoverActive && (p.backgroundUrl || p.bgStyle) && (
          <div
            className="absolute inset-0 bg-black/45 pointer-events-none z-5"
            data-export-ignore="true"
          />
        )}

        {!p.backgroundUrl && !p.bgStyle && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-6">
            <div className="w-16 h-16 rounded-2xl bg-white/6 flex items-center justify-center border border-white/8">
              <ImageIcon size={28} className="text-white/35" />
            </div>
            <p className="text-sm font-semibold text-white/50 text-center">
              {t('createPost.storyComposer.pick_background')}
            </p>
            <button
              type="button"
              onClick={() => p.setActiveTab('background')}
              className="min-h-12 px-5 rounded-xl bg-white/10 border border-white/12 text-sm font-bold text-white"
            >
              {t('createPost.storyComposer.open_backgrounds')}
            </button>
          </div>
        )}

        {p.elements.map((el) => (
          <DraggableStoryElement
            key={el.id}
            el={el}
            containerRef={p.containerRef}
            isSelected={p.selectedElementId === el.id && !p.textTakeoverActive}
            hidden={p.textTakeover === 'edit' && el.id === p.selectedElementId}
            dimmed={p.textTakeoverActive}
            onUpdate={p.updateElement}
            onSelect={p.setSelectedElementId}
            onDragActiveChange={p.setDraggingLayer}
            setShowVGuide={p.setShowVGuide}
            setShowHGuide={p.setShowHGuide}
            onTextEdit={p.openTextEdit}
          />
        ))}

        {p.textTakeoverActive && p.textTakeover && (
          <StoryTextTakeoverEditor
            editorRef={p.textEditorRef}
            textInput={p.textInput}
            textStyle={p.textStyle}
            textAlign={p.textAlign}
            textWidth={p.textWidth}
            previewCss={p.takeoverPreviewCss}
            textTakeover={p.textTakeover}
            selectedElementId={p.selectedElementId}
            onTextChange={p.setTextInput}
            onUpdateElement={p.updateElement}
          />
        )}

        <StorySafeGuides visible={p.draggingLayer} />

        {p.showVGuide && (
          <div className="absolute inset-y-0 left-1/2 w-0.5 bg-[#ff00ea] z-100 pointer-events-none shadow-[0_0_15px_rgba(255,0,234,0.8)]" />
        )}
        {p.showHGuide && (
          <div className="absolute inset-x-0 top-1/2 h-0.5 bg-[#ff00ea] z-100 pointer-events-none shadow-[0_0_15px_rgba(255,0,234,0.8)]" />
        )}
      </div>
    </div>
  );
}
