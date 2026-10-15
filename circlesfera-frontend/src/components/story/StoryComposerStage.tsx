import { Image as ImageIcon } from 'lucide-react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import { logger } from '../../utils/logger';
import DraggableStoryElement from './DraggableStoryElement';
import { StoryCanvas, type StoryCanvasRef } from './Editor/StoryCanvas';
import StoryBin from './StoryBin';
import StorySafeGuides from './StorySafeGuides';
import StoryTextTakeoverEditor from './StoryTextTakeoverEditor';
import type { StoryComposerTab } from './storyComposer.types';
import { useStoryGestures } from './useStoryGestures';

export interface StoryComposerStageProps {
  stagePadClass: string;
  stageFitClass: string;
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
  commitElements: () => void;
  removeElement: (id: string) => void;
  setDraggingLayer: (v: boolean) => void;
  setShowVGuide: (v: boolean) => void;
  setShowHGuide: (v: boolean) => void;
  openTextEdit: (el: StoryElement) => void;
  setTextInput: (v: string) => void;
  /** Controls laid over the canvas, outside the picture that is exported. */
  overlay?: ReactNode;
}

/**
 * The 9:16 story canvas, which is what is exported, inside a frame of the same
 * size that also carries the controls laid over it.
 */
export default function StoryComposerStage(p: StoryComposerStageProps) {
  const { t } = useTranslation();
  const gestures = useStoryGestures({
    containerRef: p.containerRef,
    elements: p.elements,
    selectedElementId: p.selectedElementId,
    enabled: !p.textTakeoverActive && p.activeTab !== 'draw',
    onSelect: p.setSelectedElementId,
    onTextEdit: p.openTextEdit,
    onUpdate: p.updateElement,
    onCommit: p.commitElements,
    onRemove: p.removeElement,
    onDragActiveChange: p.setDraggingLayer,
    setShowVGuide: p.setShowVGuide,
    setShowHGuide: p.setShowHGuide,
  });

  return (
    <div
      // The canvas is sized from this stage with container units.
      className={`relative w-full flex items-start md:items-center justify-center md:px-10 transition-[padding] duration-200 ${p.stageFitClass} ${p.stagePadClass}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !p.textTakeoverActive) {
          p.setSelectedElementId(null);
        }
      }}
    >
      <div className={`relative shrink-0 ${p.cardSizeClass}`}>
        <div
          ref={p.containerRef}
          onPointerDown={(e) => {
            // A second finger anywhere on the canvas joins the held piece.
            if (gestures.onCanvasPointerDown(e)) return;
            if (e.target === e.currentTarget && !p.textTakeoverActive) {
              p.setSelectedElementId(null);
            }
          }}
          // The fingers move, turn and draw the pieces of the story here: the
          // browser does not pan or zoom the page from this surface.
          // Its own layer: the pieces never rise over the controls above it.
          className="absolute inset-0 isolate touch-none overflow-hidden bg-black rounded-2xl md:rounded-3xl md:border md:border-white/10 md:shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
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
                className="min-h-12 px-6 rounded-full bg-white/10 border border-white/12 text-sm font-semibold text-white"
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
              // The piece under the fingers rises above the others.
              isSelected={
                (p.selectedElementId === el.id ||
                  gestures.activeId === el.id) &&
                !p.textTakeoverActive
              }
              hidden={
                p.textTakeover === 'edit' && el.id === p.selectedElementId
              }
              dimmed={p.textTakeoverActive}
              overBin={gestures.overBin && gestures.activeId === el.id}
              onPointerDown={gestures.onPiecePointerDown}
            />
          ))}

          {p.draggingLayer && gestures.activeId ? (
            <StoryBin active={gestures.overBin} />
          ) : null}

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
            <div className="absolute inset-y-0 left-1/2 w-0.5 bg-snap-guide z-100 pointer-events-none shadow-[0_0_15px_rgba(var(--snap-guide-rgb),0.8)]" />
          )}
          {p.showHGuide && (
            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-snap-guide z-100 pointer-events-none shadow-[0_0_15px_rgba(var(--snap-guide-rgb),0.8)]" />
          )}
        </div>
        {p.overlay}
      </div>
    </div>
  );
}
