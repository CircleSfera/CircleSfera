import { motion } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  QNA_PROMPT_MAX,
  QNA_SUGGESTION_KEYS,
} from '../storyComposer.constants';
import { QnaStickerPreview } from '../storyInteractive';

export interface StoryQnaPanelProps {
  qnaPrompt: string;
  onQnaPromptChange: (value: string) => void;
  onAddQna: () => void;
}

export default function StoryQnaPanel({
  qnaPrompt,
  onQnaPromptChange,
  onAddQna,
}: StoryQnaPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      key="qna-tab"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.25 }}
      className="px-3 space-y-3 max-w-md mx-auto"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary border border-brand-primary/25">
          <HelpCircle size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-white/45 uppercase tracking-[0.14em]">
            {t('createPost.storyComposer.qna_title')}
          </p>
          <p className="text-[11px] text-white/35 truncate">
            {t('createPost.storyComposer.qna_create_hint')}
          </p>
        </div>
      </div>

      <div className="flex justify-center py-1">
        <QnaStickerPreview
          variant="panel"
          prompt={
            qnaPrompt.trim() || t('createPost.storyComposer.qna_prompt_ph')
          }
          label={t('createPost.storyComposer.tool_qna')}
          hint={t('createPost.storyComposer.qna_preview_hint')}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between gap-2 text-[10px] text-white/35 tabular-nums">
          <span>{t('createPost.storyComposer.qna_prompt')}</span>
          <span>
            {qnaPrompt.length}/{QNA_PROMPT_MAX}
          </span>
        </div>
        <input
          type="text"
          value={qnaPrompt}
          maxLength={QNA_PROMPT_MAX}
          onChange={(e) => onQnaPromptChange(e.target.value)}
          placeholder={t('createPost.storyComposer.qna_prompt_ph')}
          className="w-full min-h-12 bg-white/6 text-white px-4 py-3 rounded-xl outline-none border border-white/10 text-sm font-semibold focus:border-brand-primary/40"
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {QNA_SUGGESTION_KEYS.map((key) => {
          const suggestion = t(key);
          return (
            <button
              type="button"
              key={key}
              onClick={() => onQnaPromptChange(suggestion)}
              className="shrink-0 min-h-9 px-3 rounded-full text-[11px] font-semibold text-white/65 bg-white/6 border border-white/8 hover:bg-white/10 hover:text-white"
            >
              {suggestion}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onAddQna}
        disabled={!qnaPrompt.trim()}
        className="w-full min-h-12 py-3 bg-brand-primary text-white font-bold text-sm rounded-xl disabled:opacity-30 transition-all"
      >
        {t('createPost.storyComposer.add_qna')}
      </button>
    </motion.div>
  );
}
