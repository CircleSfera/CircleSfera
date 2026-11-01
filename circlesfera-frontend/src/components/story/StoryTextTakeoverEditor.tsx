import {
  type CSSProperties,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import { useStoryKeyboardInset } from './useStoryKeyboardInset';

/**
 * Where the middle of the text goes, from the top of the canvas: the middle
 * of the band that the bars and the keyboard leave free, kept on the canvas.
 * Without that band, the middle of the canvas.
 */
export function textCentreTop(
  canvas: Pick<DOMRect, 'top' | 'height'>,
  band: Pick<DOMRect, 'top' | 'height'> | null,
): number {
  if (!band || band.height <= 0) return canvas.height / 2;
  const centre = band.top + band.height / 2 - canvas.top;
  return Math.min(canvas.height, Math.max(0, centre));
}

/** Keeps the text in the middle of the free band as the keyboard moves. */
function useTextCentre(
  wrapperRef: RefObject<HTMLDivElement | null>,
): number | null {
  const keyboardInset = useStoryKeyboardInset();
  const [top, setTop] = useState<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the band moves with the keyboard, so it is measured again when the keyboard does
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = wrapper?.offsetParent;
    if (!wrapper || !canvas) return;
    const composer = canvas.closest('[data-testid="story-composer"]');
    const band = composer?.querySelector('[data-story-text-band]');
    const measure = () =>
      setTop(
        textCentreTop(
          canvas.getBoundingClientRect(),
          band ? band.getBoundingClientRect() : null,
        ),
      );
    measure();
    // The band changes when the type options open under it, and the canvas
    // while it settles into text mode.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(canvas);
    if (band) observer?.observe(band);
    // The canvas also slides down without changing size as text mode opens.
    composer?.addEventListener('transitionend', measure);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      composer?.removeEventListener('transitionend', measure);
      window.removeEventListener('resize', measure);
    };
  }, [wrapperRef, keyboardInset]);

  return top;
}

interface StoryTextTakeoverEditorProps {
  editorRef: RefObject<HTMLDivElement | null>;
  textInput: string;
  textStyle: StoryElement['textStyle'];
  textAlign: 'left' | 'center' | 'right';
  textWidth: number;
  previewCss: CSSProperties;
  textTakeover: 'create' | 'edit';
  selectedElementId: string | null;
  onTextChange: (value: string) => void;
  onUpdateElement: (id: string, updates: Partial<StoryElement>) => void;
}

/**
 * The text being written, on the canvas with the same look it will have on
 * the story, in the middle of what the bars and the keyboard leave free.
 */
export default function StoryTextTakeoverEditor({
  editorRef,
  textInput,
  textStyle,
  textAlign,
  textWidth,
  previewCss,
  textTakeover,
  selectedElementId,
  onTextChange,
  onUpdateElement,
}: StoryTextTakeoverEditorProps) {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const centreTop = useTextCentre(wrapperRef);

  return (
    <div
      ref={wrapperRef}
      className="absolute left-1/2 top-1/2 z-[120] -translate-x-1/2 -translate-y-1/2 pointer-events-auto max-w-[90%] transition-[top] duration-200"
      data-export-ignore="true"
      data-story-text-keep=""
      data-testid="story-text-editor"
      style={{
        width: textWidth ? `${textWidth}px` : undefined,
        top: centreTop ?? undefined,
      }}
    >
      <div className="relative">
        {!textInput && (
          <span
            className="absolute inset-0 px-1 py-0.5 text-white/35 pointer-events-none select-none whitespace-nowrap"
            style={{
              fontFamily: previewCss.fontFamily,
              fontSize: previewCss.fontSize,
              textAlign:
                textAlign === 'left'
                  ? 'left'
                  : textAlign === 'right'
                    ? 'right'
                    : 'center',
              lineHeight: previewCss.lineHeight,
              width: 'max-content',
              left: textAlign === 'center' ? '50%' : undefined,
              right: textAlign === 'right' ? 0 : undefined,
              transform:
                textAlign === 'center' ? 'translateX(-50%)' : undefined,
            }}
          >
            {t('createPost.storyComposer.text_placeholder')}
          </span>
        )}
        {/* contentEditable div: same CSS shell as sticker text (neon shadows); not a textarea */}
        {/* biome-ignore lint/a11y/useSemanticElements: WYSIWYG needs contentEditable for text-shadow parity */}
        <div
          ref={editorRef}
          role="textbox"
          tabIndex={0}
          aria-multiline="true"
          aria-label={t('createPost.storyComposer.text_placeholder')}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => {
            // biome-ignore lint/performance/useDomNodeTextContent: the line breaks a person types are only in innerText
            const v = e.currentTarget.innerText.replace(/\n$/, '');
            onTextChange(v);
            if (textTakeover === 'edit' && selectedElementId) {
              onUpdateElement(selectedElementId, { content: v });
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const plain = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, plain);
          }}
          className={`relative rounded-lg outline-none whitespace-pre-wrap break-words ${
            textInput && (textStyle === 'box' || textStyle === 'box-shadow')
              ? 'bg-black/70 backdrop-blur-md px-2.5 py-1'
              : 'px-1 py-0.5'
          } ${
            textInput && textStyle === 'box-shadow'
              ? 'shadow-[0_10px_30px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)]'
              : ''
          } ${textStyle === 'neon' ? 'font-bold' : ''}`}
          style={{
            ...previewCss,
            ...(textInput
              ? {}
              : {
                  width: 'max-content',
                  minWidth: '12ch',
                  background: 'transparent',
                  WebkitTextFillColor: undefined,
                }),
            caretColor: '#ffffff',
            minWidth: textInput ? '3ch' : '12ch',
            width: textWidth
              ? '100%'
              : textInput && (textStyle === 'box' || textStyle === 'box-shadow')
                ? 'fit-content'
                : 'max-content',
            maxWidth: '100%',
          }}
        />
      </div>
    </div>
  );
}
