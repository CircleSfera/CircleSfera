import { HIDDEN_WORD_MAX_LENGTH } from '@circlesfera/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareOff, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { hiddenWordsApi } from '../../services/hiddenWords.service';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { ErrorState } from '../ErrorEmptyStates';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

const QUERY_KEY = ['hidden-words'];

// The words, phrases and emojis the active Profile hides from the comments
// on its posts, as the muted words of the feed are kept.
export default function HiddenWordsSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [word, setWord] = useState('');

  const list = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => hiddenWordsApi.list().then((r) => r.data),
  });

  const add = useMutation({
    mutationFn: (w: string) => hiddenWordsApi.add(w),
    onSuccess: () => {
      setWord('');
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(t('hiddenWords.added'));
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, t, 'hiddenWords.error')),
  });

  const remove = useMutation({
    mutationFn: (w: string) => hiddenWordsApi.remove(w),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(t('hiddenWords.removed'));
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, t, 'hiddenWords.error')),
  });

  if (list.isLoading) {
    return <p className="text-white/50 text-sm">{t('common.loading')}</p>;
  }
  if (list.isError || !list.data) {
    return <ErrorState onRetry={() => void list.refetch()} />;
  }
  const { words, max } = list.data;

  return (
    <div className="max-w-xl space-y-6">
      <SettingsSection
        title={t('hiddenWords.title')}
        description={t('hiddenWords.desc')}
        card={false}
      >
        <form
          className="flex gap-2 mb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (word.trim()) add.mutate(word.trim());
          }}
        >
          <input
            value={word}
            maxLength={HIDDEN_WORD_MAX_LENGTH}
            onChange={(e) => setWord(e.target.value)}
            placeholder={t('hiddenWords.placeholder')}
            aria-label={t('hiddenWords.placeholder')}
            className="flex-1 min-w-0 min-h-12 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <Button
            type="submit"
            isLoading={add.isPending}
            disabled={!word.trim()}
            className="min-h-12"
          >
            {t('hiddenWords.add')}
          </Button>
        </form>
        <p className="mb-3 text-xs text-white/40">
          {t('hiddenWords.count', { count: words.length, max })}
        </p>
        {words.length === 0 ? (
          <p className="text-white/40 text-sm">{t('hiddenWords.none')}</p>
        ) : (
          <ul className="space-y-2">
            {words.map((w) => (
              <li
                key={w.word}
                className="flex items-center justify-between gap-2 pl-3 min-h-12 rounded-lg bg-white/5"
              >
                <span className="min-w-0 truncate text-white text-sm font-medium flex items-center gap-2">
                  <MessageSquareOff
                    size={14}
                    className="shrink-0 text-brand-primary-text"
                    aria-hidden
                  />
                  {w.word}
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate(w.word)}
                  className="min-h-11 min-w-11 flex items-center justify-center text-white/40 hover:text-white"
                  aria-label={t('hiddenWords.remove', { word: w.word })}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
