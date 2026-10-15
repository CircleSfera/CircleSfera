import { motion } from 'framer-motion';
import { BarChart2, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CREATE_PRIMARY } from '../../create-post/createStyles';
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  POLL_SUGGESTION_KEYS,
} from '../storyComposer.constants';
import { PollStickerPreview } from '../storyInteractive';

export interface StoryPollPanelProps {
  pollQuestion: string;
  /** Two to four answers. */
  pollOptions: string[];
  onPollQuestionChange: (value: string) => void;
  onPollOptionsChange: (value: string[]) => void;
  onAddPoll: () => void;
}

export default function StoryPollPanel({
  pollQuestion,
  pollOptions,
  onPollQuestionChange,
  onPollOptionsChange,
  onAddPoll,
}: StoryPollPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      key="poll-tab"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.25 }}
      className="px-3 space-y-3 max-w-md mx-auto"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary-text border border-brand-primary/25">
          <BarChart2 size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-white/45 uppercase tracking-[0.14em]">
            {t('createPost.storyComposer.poll_title')}
          </p>
          <p className="text-xs text-white/35 truncate">
            {t('createPost.storyComposer.poll_create_hint')}
          </p>
        </div>
      </div>

      <div className="flex justify-center py-1">
        <PollStickerPreview
          variant="panel"
          question={
            pollQuestion.trim() ||
            t('createPost.storyComposer.poll_question_ph')
          }
          options={pollOptions.map(
            (o, i) =>
              o.trim() ||
              t('createPost.storyComposer.poll_option_n', { n: i + 1 }),
          )}
          label={t('createPost.storyComposer.tool_poll')}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between gap-2 text-xs text-white/35 tabular-nums">
          <span>{t('createPost.storyComposer.poll_question')}</span>
          <span>
            {pollQuestion.length}/{POLL_QUESTION_MAX}
          </span>
        </div>
        <input
          type="text"
          value={pollQuestion}
          maxLength={POLL_QUESTION_MAX}
          onChange={(e) => onPollQuestionChange(e.target.value)}
          placeholder={t('createPost.storyComposer.poll_question_ph')}
          className="w-full min-h-12 bg-white/6 text-white px-4 py-3 rounded-2xl outline-none border border-white/10 text-base focus:border-brand-primary/40"
        />
      </div>
      <div className="space-y-2">
        {pollOptions.map((option, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: options are edited in place by position
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={option}
              maxLength={POLL_OPTION_MAX}
              onChange={(e) =>
                onPollOptionsChange(
                  pollOptions.map((o, i) => (i === index ? e.target.value : o)),
                )
              }
              placeholder={t('createPost.storyComposer.poll_option_n', {
                n: index + 1,
              })}
              aria-label={t('createPost.storyComposer.poll_option_n', {
                n: index + 1,
              })}
              className="flex-1 min-w-0 min-h-12 bg-white/6 text-white px-4 py-2 rounded-2xl outline-none border border-white/10 text-base"
            />
            {pollOptions.length > POLL_MIN_OPTIONS ? (
              <button
                type="button"
                onClick={() =>
                  onPollOptionsChange(pollOptions.filter((_, i) => i !== index))
                }
                aria-label={t('createPost.storyComposer.poll_remove_option', {
                  n: index + 1,
                })}
                className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-full bg-white/6 border border-white/10 text-white/70 hover:text-white"
              >
                <X size={16} aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
        {pollOptions.length < POLL_MAX_OPTIONS ? (
          <button
            type="button"
            onClick={() => onPollOptionsChange([...pollOptions, ''])}
            className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-white/80 bg-white/6 border border-white/10 hover:bg-white/10"
          >
            <Plus size={16} aria-hidden />
            {t('createPost.storyComposer.poll_add_option')}
          </button>
        ) : null}
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {POLL_SUGGESTION_KEYS.map((key) => {
          const suggestion = t(key);
          return (
            <button
              type="button"
              key={key}
              onClick={() => onPollQuestionChange(suggestion)}
              className="shrink-0 min-h-11 px-3 rounded-full text-xs font-semibold text-white/65 bg-white/6 border border-white/8 hover:bg-white/10 hover:text-white"
            >
              {suggestion}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onAddPoll}
        disabled={!pollQuestion.trim()}
        className={`button-alone ${CREATE_PRIMARY}`}
      >
        {t('createPost.storyComposer.add_poll')}
      </button>
    </motion.div>
  );
}
