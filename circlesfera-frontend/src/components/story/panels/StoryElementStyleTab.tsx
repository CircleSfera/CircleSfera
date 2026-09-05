import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';
import {
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  QNA_PROMPT_MAX,
} from '../storyComposer.constants';
import {
  isPollElement,
  isQnaElement,
  type PollPayload,
  parsePollPayload,
  parseQnaPayload,
} from '../storyInteractive';

export interface StoryElementStyleTabProps {
  selectedElementId: string;
  selectedElement: StoryElement;
  onUpdateElement: (id: string, updates: Partial<StoryElement>) => void;
}

export default function StoryElementStyleTab({
  selectedElementId,
  selectedElement,
  onUpdateElement,
}: StoryElementStyleTabProps) {
  const { t } = useTranslation();

  if (isPollElement(selectedElement)) {
    const poll = parsePollPayload(selectedElement.content) || {
      question: '',
      options: ['Sí', 'No'],
    };
    const commit = (next: PollPayload) => {
      onUpdateElement(selectedElementId, {
        content: JSON.stringify({
          question: next.question.slice(0, POLL_QUESTION_MAX),
          options: [
            (next.options[0] || 'Sí').slice(0, POLL_OPTION_MAX),
            (next.options[1] || 'No').slice(0, POLL_OPTION_MAX),
          ],
        }),
      });
    };
    return (
      <div className="space-y-3 animate-slide-up">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-white/40 uppercase tracking-[0.12em]">
              {t('createPost.storyComposer.poll_question')}
            </span>
            <span className="text-[10px] tabular-nums text-white/35">
              {poll.question.length}/{POLL_QUESTION_MAX}
            </span>
          </div>
          <textarea
            value={poll.question}
            rows={2}
            maxLength={POLL_QUESTION_MAX}
            onChange={(e) =>
              commit({
                ...poll,
                question: e.target.value,
              })
            }
            className="w-full min-h-12 bg-white/6 text-white px-3.5 py-2.5 rounded-xl outline-none border border-white/10 focus:border-brand-primary/45 text-sm font-semibold resize-none"
            placeholder={t('createPost.storyComposer.poll_question_ph')}
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1].map((idx) => (
            <div key={`edit-opt-${idx}`} className="space-y-1">
              <span className="text-[10px] font-bold text-white/35 uppercase tracking-wider">
                {t(`createPost.storyComposer.poll_option_${idx + 1}`)}
              </span>
              <input
                type="text"
                value={poll.options[idx] || ''}
                maxLength={POLL_OPTION_MAX}
                onChange={(e) => {
                  const options = [
                    poll.options[0] || '',
                    poll.options[1] || '',
                  ];
                  options[idx] = e.target.value;
                  commit({ ...poll, options });
                }}
                className="w-full min-h-11 bg-white/6 text-white px-3 rounded-xl outline-none border border-white/10 text-sm"
                placeholder={t(
                  `createPost.storyComposer.poll_option_${idx + 1}`,
                )}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isQnaElement(selectedElement)) {
    const qna = parseQnaPayload(selectedElement.content) || {
      prompt: '',
    };
    return (
      <div className="space-y-3 animate-slide-up">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-white/40 uppercase tracking-[0.12em]">
              {t('createPost.storyComposer.qna_prompt')}
            </span>
            <span className="text-[10px] tabular-nums text-white/35">
              {qna.prompt.length}/{QNA_PROMPT_MAX}
            </span>
          </div>
          <textarea
            value={qna.prompt}
            rows={3}
            maxLength={QNA_PROMPT_MAX}
            onChange={(e) =>
              onUpdateElement(selectedElementId, {
                content: JSON.stringify({
                  prompt: e.target.value.slice(0, QNA_PROMPT_MAX),
                }),
              })
            }
            className="w-full min-h-16 bg-white/6 text-white px-3.5 py-2.5 rounded-xl outline-none border border-white/10 focus:border-brand-primary/45 text-sm font-semibold resize-none"
            placeholder={t('createPost.storyComposer.qna_prompt_ph')}
          />
        </div>
        <p className="text-[11px] text-white/40 leading-relaxed">
          {t('createPost.storyComposer.qna_edit_hint')}
        </p>
      </div>
    );
  }

  return null;
}
