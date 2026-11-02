import { Image as ImageIcon } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import { logger } from '../../utils/logger';
import DraggableStoryElement from './DraggableStoryElement';
import { StoryCanvas, type StoryCanvasRef } from './Editor/StoryCanvas';
import StoryBin from './StoryBin';
import StorySafeGuides from './StorySafeGuides';
import StoryTextTakeoverEditor from './StoryTextTakeoverEditor';
import type { StoryBrush, StoryComposerTab } from './storyComposer.types';
import {
  backgroundFilterCss,
  filterName,
  photoKeyAction,
  photoTransformCss,
  type StoryPhotoEdit,
  stepFilter,
} from './storyPhoto';
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
  brush: StoryBrush;
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
  /** The place, scale, angle and filter of the photo behind the story. */
  photo: StoryPhotoEdit;
  /** Changes the photo as a gesture goes; `commitElements` makes the step. */
  updatePhoto: (updates: Partial<StoryPhotoEdit>) => void;
  /** Changes the photo as one undo step. */
  changePhoto: (change: (photo: StoryPhotoEdit) => StoryPhotoEdit) => void;
  setSelectedElementId: (id: string | null) => void;
  setActiveTab: (tab: StoryComposerTab) => void;
  updateElement: (id: string, updates: Partial<StoryElement>) => void;
  commitElements: () => void;
  removeElement: (id: string) => void;
  setDraggingLayer: (v: boolean) => void;
  setShowVGuide: (v: boolean) => void;
  setShowHGuide: (v: boolean) => void;
  openTextEdit: (el: StoryElement) => void;
  /** A tap on the story itself, with nothing selected and no tool open. */
  onCanvasTap?: () => void;
  setTextInput: (v: string) => void;
  /** Controls laid over the canvas, outside the picture that is exported. */
  overlay?: ReactNode;
}

/** How long the name of a filter shows once it is chosen, in ms. */
const FILTER_NAME_MS = 1200;
/** How long the keys rest before their moves are one undo step, in ms. */
const KEY_REST_MS = 400;

/**
 * The 9:16 story canvas, which is what is exported, inside a frame of the same
 * size that also carries the controls laid over it. On a phone it is edge to
 * edge, with square corners; on desktop it is a rounded frame over the
 * brand's background.
 */
export default function StoryComposerStage(p: StoryComposerStageProps) {
  const { t } = useTranslation();
  const isVideo = p.background?.type.startsWith('video/') ?? false;
  // A video keeps its centred crop and takes no filter.
  const isPhoto = Boolean(p.backgroundUrl) && !isVideo;
  const photoEnabled =
    isPhoto &&
    !p.textTakeoverActive &&
    !p.panelOpen &&
    p.activeTab === 'none' &&
    !p.selectedElementId;
  const stepPhotoFilter = (direction: 1 | -1, from?: StoryPhotoEdit) =>
    p.changePhoto((current) => {
      const base = from ?? current;
      return { ...base, filter: stepFilter(base.filter, direction) };
    });
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
    photo: p.photo,
    photoEnabled,
    onPhotoUpdate: p.updatePhoto,
    onFilterStep: stepPhotoFilter,
  });

  // The name of a filter shows briefly once it changes on the same photo.
  const [shownFilter, setShownFilter] = useState<string | null>(null);
  const lastFilterRef = useRef({
    url: p.backgroundUrl,
    filter: p.photo.filter,
  });
  useEffect(() => {
    const last = lastFilterRef.current;
    lastFilterRef.current = { url: p.backgroundUrl, filter: p.photo.filter };
    if (last.url !== p.backgroundUrl) {
      setShownFilter(null);
      return;
    }
    if (last.filter === p.photo.filter) return;
    setShownFilter(filterName(p.photo.filter));
    const timer = setTimeout(() => setShownFilter(null), FILTER_NAME_MS);
    return () => clearTimeout(timer);
  }, [p.backgroundUrl, p.photo.filter]);

  // The keys move the photo a step at a time; their moves are one undo step
  // once the keys rest.
  const keyRestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleKeys = () => {
    if (!keyRestRef.current) return;
    clearTimeout(keyRestRef.current);
    keyRestRef.current = null;
    p.commitElements();
  };
  useEffect(
    () => () => {
      if (keyRestRef.current) clearTimeout(keyRestRef.current);
    },
    [],
  );
  // Named for screen readers, with the keys that edit it, only while the
  // photo can be edited.
  const photoKeys = photoEnabled
    ? {
        role: 'application',
        tabIndex: 0,
        'aria-label': t('createPost.storyComposer.photo_label'),
        'aria-keyshortcuts': 'ArrowLeft ArrowRight ArrowUp ArrowDown + - [ ]',
      }
    : {};
  const onCanvasKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || !photoEnabled) return;
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const action = photoKeyAction(e.key, e.shiftKey, p.photo);
    if (!action) return;
    e.preventDefault();
    if (action.kind === 'filter') {
      settleKeys();
      stepPhotoFilter(action.direction);
      return;
    }
    p.updatePhoto(action.photo);
    if (keyRestRef.current) clearTimeout(keyRestRef.current);
    keyRestRef.current = setTimeout(() => {
      keyRestRef.current = null;
      p.commitElements();
    }, KEY_REST_MS);
  };
  // Where a tap on the story itself began; pieces and gestures leave it empty.
  const canvasTapRef = useRef<{ x: number; y: number } | null>(null);
  const canTapCanvas =
    Boolean(p.onCanvasTap) &&
    !p.textTakeoverActive &&
    !p.panelOpen &&
    p.activeTab === 'none' &&
    !p.selectedElementId &&
    Boolean(p.backgroundUrl || p.bgStyle);

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
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a tap on the story is a shortcut; the "Text" tool is the way in from the keyboard */}
        <div
          ref={p.containerRef}
          data-testid="story-canvas"
          // With a photo, the canvas takes the focus and its keys edit it.
          {...photoKeys}
          onKeyDown={onCanvasKeyDown}
          onPointerDownCapture={() => {
            canvasTapRef.current = null;
          }}
          onPointerDown={(e) => {
            // A second finger anywhere on the canvas joins the held piece.
            if (gestures.onCanvasPointerDown(e)) return;
            if (canTapCanvas && e.isPrimary !== false) {
              canvasTapRef.current = { x: e.clientX, y: e.clientY };
            }
            if (e.target === e.currentTarget && !p.textTakeoverActive) {
              p.setSelectedElementId(null);
            }
          }}
          // A tap on the story starts a text, with the keyboard open: the
          // text opens within the tap, which a phone needs to show it.
          onClick={(e) => {
            const start = canvasTapRef.current;
            canvasTapRef.current = null;
            if (!start || !canTapCanvas) return;
            // A touch that moved the photo, or swiped its filter, was no tap.
            if (isPhoto && gestures.photoMoved()) return;
            if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
              return;
            }
            p.onCanvasTap?.();
          }}
          // The fingers move, turn and draw the pieces of the story here: the
          // browser does not pan or zoom the page from this surface.
          // Its own layer: the pieces never rise over the controls above it.
          className="group absolute inset-0 isolate touch-none overflow-hidden bg-black outline-none md:rounded-3xl md:border md:border-white/10 md:shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
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
                // The video is shared as itself, not painted into the layer.
                data-export-ignore="true"
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
                // The fingers move the photo: the browser neither drags the
                // picture out nor offers to save it on a long press.
                draggable={false}
                className="w-full h-full object-cover select-none [-webkit-touch-callout:none]"
                alt=""
                data-testid="story-photo"
                onLoad={() => logger.log('Background image loaded in editor')}
                // The export paints these as they are on screen.
                style={{
                  transform: photoTransformCss(p.photo),
                  filter: backgroundFilterCss({
                    filter: p.photo.filter,
                    blur: p.bgBlur,
                    darken: p.bgDarken,
                  }),
                }}
              />
            ))}

          <StoryCanvas
            ref={p.storyCanvasRef}
            isDrawingMode={p.activeTab === 'draw'}
            brushColor={p.brushColor}
            brushWidth={p.brushWidth}
            brush={p.brush}
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
              isSelected={
                (p.selectedElementId === el.id ||
                  gestures.activeId === el.id) &&
                !p.textTakeoverActive
              }
              // The piece under the fingers rises above the others, the
              // selected one too.
              isActive={gestures.activeId === el.id && !p.textTakeoverActive}
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

          {shownFilter && (
            <div
              data-export-ignore="true"
              aria-hidden="true"
              data-testid="story-filter-name"
              className="absolute inset-x-0 top-1/3 z-90 flex justify-center pointer-events-none"
            >
              <span className="text-3xl font-semibold text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">
                {shownFilter}
              </span>
            </div>
          )}

          {/* The focus ring, over the photo, which a transform lifts above
              the canvas's own outline. */}
          <div
            data-export-ignore="true"
            className="absolute inset-0 z-100 hidden pointer-events-none ring-2 ring-inset ring-white/70 group-focus-visible:block md:rounded-3xl"
          />

          <StorySafeGuides visible={p.draggingLayer} />

          {p.showVGuide && (
            <div className="absolute inset-y-0 left-1/2 w-0.5 bg-snap-guide z-100 pointer-events-none shadow-[0_0_15px_rgba(var(--snap-guide-rgb),0.8)]" />
          )}
          {p.showHGuide && (
            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-snap-guide z-100 pointer-events-none shadow-[0_0_15px_rgba(var(--snap-guide-rgb),0.8)]" />
          )}
        </div>
        {p.overlay}
        <div role="status" className="sr-only">
          {shownFilter
            ? t('createPost.storyComposer.photo_filter', { name: shownFilter })
            : ''}
        </div>
      </div>
    </div>
  );
}
