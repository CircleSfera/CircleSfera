import { BarChart2, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui';
import { SUBSCREEN_BODY, SUBSCREEN_SHELL } from './ComposerChrome';
import SubScreenHeader from './SubScreenHeader';

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
    value?.kind === 'poll' ? value.options[0] : t('createPost.interactive.yes'),
  );
  const [option2, setOption2] = useState(
    value?.kind === 'poll' ? value.options[1] : t('createPost.interactive.no'),
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
    <div className={SUBSCREEN_SHELL}>
      <SubScreenHeader
        title={t('createPost.interactive.title')}
        onClose={onClose}
      />

      <div className={SUBSCREEN_BODY}>
        <div className="flex gap-1 p-0.5 rounded-xl bg-white/5 border border-white/8">
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
              className={`flex-1 min-h-9 px-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                kind === item.id
                  ? 'bg-white/12 text-white'
                  : 'text-white/45 hover:text-white/70'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {kind === 'poll' && (
          <div className="space-y-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('createPost.interactive.poll_question')}
              className="!h-10 !rounded-lg !px-3"
            />
            <Input
              value={option1}
              onChange={(e) => setOption1(e.target.value)}
              placeholder={t('createPost.interactive.option_a')}
              className="!h-10 !rounded-lg !px-3"
            />
            <Input
              value={option2}
              onChange={(e) => setOption2(e.target.value)}
              placeholder={t('createPost.interactive.option_b')}
              className="!h-10 !rounded-lg !px-3"
            />
          </div>
        )}

        {kind === 'qna' && (
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('createPost.interactive.qna_prompt')}
            className="!h-10 !rounded-lg !px-3"
          />
        )}

        <button
          type="button"
          onClick={save}
          className="w-full h-10 rounded-lg bg-linear-to-r from-brand-primary to-brand-blue text-white font-semibold text-sm shadow-md shadow-brand-primary/20 hover:opacity-95 active:scale-[0.98] transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
        >
          {t('createPost.interactive.save')}
        </button>
      </div>
    </div>
  );
}
