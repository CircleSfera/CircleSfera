import { motion } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  POLL_SUGGESTION_KEYS,
} from '../storyComposer.constants';
import { PollStickerPreview } from '../storyInteractive';

export interface StoryPollPanelProps {
  pollQuestion: string;
  pollOption1: string;
  pollOption2: string;
  onPollQuestionChange: (value: string) => void;
  onPollOption1Change: (value: string) => void;
  onPollOption2Change: (value: string) => void;
  onAddPoll: () => void;
}

export default function StoryPollPanel({
  pollQuestion,
  pollOption1,
  pollOption2,
  onPollQuestionChange,
  onPollOption1Change,
  onPollOption2Change,
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
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary border border-brand-primary/25">
          <BarChart2 size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-white/45 uppercase tracking-[0.14em]">
            {t('createPost.storyComposer.poll_title')}
          </p>
          <p className="text-[11px] text-white/35 truncate">
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
          options={[
            pollOption1.trim() || t('createPost.storyComposer.poll_option_1'),
            pollOption2.trim() || t('createPost.storyComposer.poll_option_2'),
          ]}
          label={t('createPost.storyComposer.tool_poll')}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between gap-2 text-[10px] text-white/35 tabular-nums">
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
          className="w-full min-h-12 bg-white/6 text-white px-4 py-3 rounded-xl outline-none border border-white/10 text-sm font-semibold focus:border-brand-primary/40"
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <input
          type="text"
          value={pollOption1}
          maxLength={POLL_OPTION_MAX}
          onChange={(e) => onPollOption1Change(e.target.value)}
          placeholder={t('createPost.storyComposer.poll_option_1')}
          className="min-h-12 bg-white/6 text-white px-3 py-2 rounded-xl outline-none border border-white/10 text-sm"
        />
        <input
          type="text"
          value={pollOption2}
          maxLength={POLL_OPTION_MAX}
          onChange={(e) => onPollOption2Change(e.target.value)}
          placeholder={t('createPost.storyComposer.poll_option_2')}
          className="min-h-12 bg-white/6 text-white px-3 py-2 rounded-xl outline-none border border-white/10 text-sm"
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {POLL_SUGGESTION_KEYS.map((key) => {
          const suggestion = t(key);
          return (
            <button
              type="button"
              key={key}
              onClick={() => onPollQuestionChange(suggestion)}
              className="shrink-0 min-h-9 px-3 rounded-full text-[11px] font-semibold text-white/65 bg-white/6 border border-white/8 hover:bg-white/10 hover:text-white"
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
        className="w-full min-h-12 py-3 bg-brand-primary text-white font-bold text-sm rounded-xl disabled:opacity-30 transition-all"
      >
        {t('createPost.storyComposer.add_poll')}
      </button>
    </motion.div>
  );
}
