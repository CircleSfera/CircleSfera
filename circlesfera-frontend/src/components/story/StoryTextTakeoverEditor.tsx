import type { CSSProperties, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';

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

/** On-canvas contentEditable — same visual shell as DraggableStoryElement. */
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

  return (
    <div
      className="absolute left-1/2 top-[32%] z-[120] -translate-x-1/2 -translate-y-1/2 pointer-events-auto max-w-[90%]"
      data-export-ignore="true"
      style={{
        width: textWidth ? `${textWidth}px` : undefined,
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
