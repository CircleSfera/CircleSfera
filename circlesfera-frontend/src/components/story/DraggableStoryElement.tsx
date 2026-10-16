import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import {
  AnswerCardPreview,
  CountdownStickerPreview,
  HashtagStickerPreview,
  INTERACTIVE_WIDTH_PCT,
  isLiveElement,
  isPollElement,
  isQnaElement,
  LocationStickerPreview,
  MentionStickerPreview,
  PollStickerPreview,
  parseAnswerPayload,
  parseCountdownPayload,
  parseHashtagPayload,
  parseLocationPayload,
  parseMentionPayload,
  parsePollPayload,
  parseQnaPayload,
  parseQuizPayload,
  parseSliderPayload,
  QnaStickerPreview,
  QuizStickerPreview,
  SliderStickerPreview,
  useStoryCanvasWidth,
} from './storyInteractive';
import { getTextStyleCSS } from './storyTextStyles';

export interface DraggableStoryElementProps {
  el: StoryElement;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isSelected: boolean;
  /** Under the fingers: above every other piece, the selected one too. */
  isActive?: boolean;
  hidden?: boolean;
  dimmed?: boolean;
  /** Held over the bin: it shrinks to say it goes if dropped. */
  overBin?: boolean;
  /** A finger came down on it; the gestures of the stage take it from here. */
  onPointerDown: (el: StoryElement, e: React.PointerEvent) => void;
}

/**
 * One piece of the story (text, emoji, poll or question), placed by its
 * position from the centre of the canvas, its scale and its angle. Moving,
 * scaling and turning it is done by `useStoryGestures`.
 */
export default function DraggableStoryElement({
  el,
  containerRef,
  isSelected,
  isActive = false,
  hidden,
  dimmed,
  overBin,
  onPointerDown,
}: DraggableStoryElementProps) {
  const { t } = useTranslation();
  const poll = isPollElement(el) ? parsePollPayload(el.content) : null;
  const qna = isQnaElement(el) ? parseQnaPayload(el.content) : null;
  const quiz = parseQuizPayload(el);
  const slider = parseSliderPayload(el);
  const hashtag = parseHashtagPayload(el);
  const mention = parseMentionPayload(el);
  const location = parseLocationPayload(el);
  const answer = parseAnswerPayload(el);
  const countdown = parseCountdownPayload(el);
  // Live on the story, not painted into its picture.
  const isLive = isLiveElement(el);
  // At the width of a sticker; a hashtag, a mention or a place takes its own.
  const isInteractive = Boolean(
    poll || qna || quiz || slider || answer || countdown,
  );
  const canvasWidth = useStoryCanvasWidth(containerRef);
  const interactivePx =
    canvasWidth > 0
      ? Math.round((canvasWidth * INTERACTIVE_WIDTH_PCT) / 100)
      : undefined;

  if (hidden) return null;

  const scale = el.scale * (overBin ? 0.45 : 1);
  return (
    <div
      onPointerDown={(e) => onPointerDown(el, e)}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(${el.x}px, ${el.y}px) translate(-50%, -50%) scale(${scale}) rotate(${el.rotation}deg)`,
        zIndex: isActive ? 210 : isSelected ? 200 : (el.zIndex ?? 100),
        width: isInteractive ? interactivePx : undefined,
        opacity:
          dimmed || overBin ? 0.4 : isInteractive ? 1 : (el.opacity ?? 1),
      }}
      data-testid="story-element"
      // A poll or a question is answered on the story itself, not painted
      // into its picture.
      data-export-ignore={isLive ? 'true' : undefined}
      className={`absolute cursor-move touch-none select-none border-2 rounded-2xl p-0.5 transition-[border-color,opacity] ${
        isSelected ? 'border-white/55' : 'border-transparent'
      }`}
    >
      {poll ? (
        <PollStickerPreview
          question={poll.question}
          options={poll.options}
          label={t('createPost.storyComposer.tool_poll')}
        />
      ) : quiz ? (
        <QuizStickerPreview
          quiz={quiz}
          label={t('createPost.storyComposer.tool_quiz')}
        />
      ) : slider ? (
        <SliderStickerPreview
          slider={slider}
          label={t('createPost.storyComposer.tool_slider')}
        />
      ) : countdown ? (
        <CountdownStickerPreview
          countdown={countdown}
          label={t('createPost.storyComposer.tool_countdown')}
        />
      ) : hashtag ? (
        <HashtagStickerPreview tag={hashtag.tag} />
      ) : mention ? (
        <MentionStickerPreview username={mention.username} />
      ) : location ? (
        <LocationStickerPreview name={location.name} />
      ) : answer ? (
        <AnswerCardPreview prompt={answer.prompt} answer={answer.answer} />
      ) : qna ? (
        <QnaStickerPreview
          prompt={qna.prompt}
          label={t('createPost.storyComposer.tool_qna')}
          hint={t('createPost.storyComposer.qna_preview_hint')}
        />
      ) : (
        <div
          className={`relative rounded-lg flex items-center justify-center select-none transition-all duration-300
          ${el.type === 'sticker' ? 'text-6xl' : ''}
          ${
            el.textStyle === 'box' || el.textStyle === 'box-shadow'
              ? 'bg-black/70 backdrop-blur-md px-2.5 py-1'
              : el.type === 'text'
                ? 'px-1 py-0.5'
                : ''
          }
          ${el.textStyle === 'box-shadow' ? 'shadow-[0_10px_30px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)]' : ''}
          ${el.textStyle === 'neon' ? 'font-bold' : ''}
        `}
          style={getTextStyleCSS(el)}
        >
          {el.content}
        </div>
      )}
    </div>
  );
}
