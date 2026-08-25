import { BarChart2, ChevronLeft, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui';

export type InteractiveDraft =
  | { kind: 'poll'; question: string; options: [string, string] }
  | { kind: 'qna'; prompt: string }
  | null;

interface InteractiveSubScreenProps {
  value: InteractiveDraft;
  onChange: (value: InteractiveDraft) => void;
  onClose: () => void;
}

export default function InteractiveSubScreen({
  value,
  onChange,
  onClose,
}: InteractiveSubScreenProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<'none' | 'poll' | 'qna'>(
    value?.kind || 'none',
  );
  const [question, setQuestion] = useState(
    value?.kind === 'poll' ? value.question : '',
  );
  const [option1, setOption1] = useState(
    value?.kind === 'poll' ? value.options[0] : 'Yes',
  );
  const [option2, setOption2] = useState(
    value?.kind === 'poll' ? value.options[1] : 'No',
  );
  const [prompt, setPrompt] = useState(
    value?.kind === 'qna' ? value.prompt : '',
  );

  const save = () => {
    if (kind === 'poll') {
      if (!question.trim() || !option1.trim() || !option2.trim()) return;
      onChange({
        kind: 'poll',
        question: question.trim(),
        options: [option1.trim(), option2.trim()],
      });
    } else if (kind === 'qna') {
      if (!prompt.trim()) return;
      onChange({ kind: 'qna', prompt: prompt.trim() });
    } else {
      onChange(null);
    }
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-surface-base flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 px-2 h-(--nav-top-height,52px) bg-surface-elevated border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 flex items-center justify-center text-white hover:bg-white/8 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          aria-label={t('createPost.header.back')}
        >
          <ChevronLeft size={22} strokeWidth={2} />
        </button>
        <h2 className="font-bold text-base text-white">
          {t('createPost.interactive.title')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'none' as const, label: t('createPost.interactive.none') },
              {
                id: 'poll' as const,
                label: t('createPost.interactive.poll'),
                icon: BarChart2,
              },
              {
                id: 'qna' as const,
                label: t('createPost.interactive.qna'),
                icon: HelpCircle,
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setKind(item.id)}
              className={`min-h-11 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                kind === item.id
                  ? 'bg-brand-primary/20 border-brand-primary/40 text-white'
                  : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {kind === 'poll' && (
          <div className="space-y-3">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('createPost.interactive.poll_question')}
            />
            <Input
              value={option1}
              onChange={(e) => setOption1(e.target.value)}
              placeholder={t('createPost.interactive.option_a')}
            />
            <Input
              value={option2}
              onChange={(e) => setOption2(e.target.value)}
              placeholder={t('createPost.interactive.option_b')}
            />
          </div>
        )}

        {kind === 'qna' && (
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('createPost.interactive.qna_prompt')}
          />
        )}

        <button
          type="button"
          onClick={save}
          className="w-full h-12 rounded-xl bg-brand-primary text-white font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
        >
          {t('common.save', 'Save')}
        </button>
      </div>
    </div>
  );
}
