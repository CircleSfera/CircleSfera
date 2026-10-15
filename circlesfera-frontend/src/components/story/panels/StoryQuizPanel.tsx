import { BadgeCheck, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';
import { CREATE_PRIMARY } from '../../create-post/createStyles';
import { buildQuizElement } from '../storyComposer.append';
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
} from '../storyComposer.constants';
import { QuizStickerPreview } from '../storyInteractive';
import { SETUP_INPUT, StoryStickerSetup } from './StoryStickerSetup';

/** Sets up a quiz: a question, two to four options and the right one. */
export default function StoryQuizPanel({
  onAdd,
}: {
  onAdd: (el: StoryElement) => void;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const quiz = buildQuizElement({ question, options, correctIndex });
  const letter = (i: number) => String.fromCharCode(65 + i);

  return (
    <StoryStickerSetup
      panelKey="quiz-tab"
      icon={BadgeCheck}
      title={t('createPost.storyComposer.tool_quiz')}
      hint={t('createPost.storyComposer.quiz_create_hint')}
    >
      <div className="flex justify-center py-1">
        <QuizStickerPreview
          variant="panel"
          label={t('createPost.storyComposer.tool_quiz')}
          quiz={{
            question:
              question.trim() || t('createPost.storyComposer.quiz_question_ph'),
            options: options.map(
              (o, i) =>
                o.trim() ||
                t('createPost.storyComposer.poll_option_n', { n: i + 1 }),
            ),
            correctIndex,
          }}
        />
      </div>
      <input
        type="text"
        value={question}
        maxLength={POLL_QUESTION_MAX}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={t('createPost.storyComposer.quiz_question_ph')}
        aria-label={t('createPost.storyComposer.poll_question')}
        className={SETUP_INPUT}
      />
      <p className="text-xs text-white/50">
        {t('createPost.storyComposer.quiz_correct_hint')}
      </p>
      <div className="space-y-2">
        {options.map((option, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: options are edited in place by position
          <div key={index} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCorrectIndex(index)}
              aria-pressed={correctIndex === index}
              aria-label={t('createPost.storyComposer.quiz_mark_correct', {
                letter: letter(index),
              })}
              className={`w-11 h-11 shrink-0 rounded-full text-sm font-bold border ${
                correctIndex === index
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'bg-white/6 border-white/10 text-white/70'
              }`}
            >
              {letter(index)}
            </button>
            <input
              type="text"
              value={option}
              maxLength={POLL_OPTION_MAX}
              onChange={(e) =>
                setOptions(
                  options.map((o, i) => (i === index ? e.target.value : o)),
                )
              }
              placeholder={t('createPost.storyComposer.poll_option_n', {
                n: index + 1,
              })}
              aria-label={t('createPost.storyComposer.poll_option_n', {
                n: index + 1,
              })}
              className={`${SETUP_INPUT} flex-1 min-w-0 py-2`}
            />
            {options.length > POLL_MIN_OPTIONS ? (
              <button
                type="button"
                onClick={() => {
                  setOptions(options.filter((_, i) => i !== index));
                  // The right answer follows its option; if it goes, A is.
                  if (index === correctIndex) setCorrectIndex(0);
                  else if (index < correctIndex)
                    setCorrectIndex(correctIndex - 1);
                }}
                aria-label={t('createPost.storyComposer.poll_remove_option', {
                  n: index + 1,
                })}
                className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-full bg-white/6 border border-white/10 text-white/70"
              >
                <X size={16} aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
        {options.length < POLL_MAX_OPTIONS ? (
          <button
            type="button"
            onClick={() => setOptions([...options, ''])}
            className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-white/80 bg-white/6 border border-white/10"
          >
            <Plus size={16} aria-hidden />
            {t('createPost.storyComposer.poll_add_option')}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => quiz && onAdd(quiz)}
        disabled={!quiz}
        className={`button-alone ${CREATE_PRIMARY}`}
      >
        {t('createPost.storyComposer.add_quiz')}
      </button>
    </StoryStickerSetup>
  );
}
