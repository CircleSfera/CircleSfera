import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { isStepUpCancelled, useAdminStepUp } from './useAdminStepUp';

// How many items one request may delete: the limit of the server.
export const BULK_DELETE_LIMIT = 50;

const BOX =
  'rounded border-white/20 bg-white/5 text-brand-primary-text focus:ring-brand-primary/50';

interface Options {
  // The items on screen: what "Select all" chooses.
  ids: string[];
  remove: (
    ids: string[],
  ) => Promise<{ data: { deleted: number; failed: number } }>;
  onDone: () => void;
  onToast: (message: string, type: 'success' | 'error') => void;
}

/**
 * Deleting several items of a list at once: a checkbox per row, a bar that
 * says how many are chosen, the question before deleting, and the second
 * confirmation of the staff member, because it cannot be undone.
 */
export function useBulkDelete({ ids, remove, onDone, onToast }: Options): {
  box: (id: string) => ReactNode;
  bar: ReactNode;
  dialogs: ReactNode;
} {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState(false);

  // An item that left the screen (another page, a filter) is no longer chosen.
  const onScreen = ids.join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the ids on screen
  useEffect(() => {
    setChosen((before) => {
      const kept = [...before].filter((id) => ids.includes(id));
      return kept.length === before.size ? before : new Set(kept);
    });
  }, [onScreen]);

  const mutation = useMutation({
    mutationFn: () =>
      stepUp
        .run(() => remove([...chosen].slice(0, BULK_DELETE_LIMIT)))
        .then((res) => res.data),
    onSuccess: ({ deleted, failed }) => {
      setChosen(new Set());
      onToast(
        failed > 0
          ? t('admin.bulk.deleted_some', { deleted, failed })
          : t('admin.bulk.deleted', { count: deleted }),
        failed > 0 && deleted === 0 ? 'error' : 'success',
      );
      onDone();
    },
    onError: (err) => {
      if (isStepUpCancelled(err)) return;
      onToast(t('admin.bulk.delete_error'), 'error');
    },
  });

  const count = chosen.size;
  const all = ids.length > 0 && count === ids.length;

  const box = (id: string) => (
    // The box is small: on a phone its label gives the finger 44 px.
    // biome-ignore lint/a11y/useKeyWithClickEvents: only stops the press from opening the row
    <label
      className="-m-3 p-3 sm:-m-1.5 sm:p-1.5 inline-flex cursor-pointer"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        className={`mt-1 w-5 h-5 sm:w-4 sm:h-4 ${BOX}`}
        checked={chosen.has(id)}
        onChange={(e) => {
          const next = new Set(chosen);
          if (e.target.checked) next.add(id);
          else next.delete(id);
          setChosen(next);
        }}
        aria-label={t('admin.bulk.select_item')}
      />
    </label>
  );

  const bar =
    ids.length === 0 ? null : (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1 pb-2">
        <label className="inline-flex items-center gap-2 min-h-11 sm:min-h-9 text-sm font-semibold text-white">
          <input
            type="checkbox"
            className={`w-5 h-5 sm:w-4 sm:h-4 ${BOX}`}
            checked={all}
            onChange={() => setChosen(all ? new Set() : new Set(ids))}
          />
          {t('admin.shared.select_all')}
        </label>
        {count > 0 && (
          <>
            <span className="text-sm text-white/70" aria-live="polite">
              {t('admin.bulk.chosen', { count })}
            </span>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="min-h-11 sm:min-h-9 text-xs sm:ml-auto"
              disabled={mutation.isPending}
              onClick={() => setAsking(true)}
            >
              <Trash2 size={14} className="mr-1.5 shrink-0" />
              {t('admin.bulk.delete_chosen')}
            </Button>
          </>
        )}
      </div>
    );

  const dialogs = (
    <>
      <ConfirmModal
        isOpen={asking}
        onClose={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          mutation.mutate();
        }}
        title={t('admin.bulk.confirm_title', { count })}
        message={t('admin.bulk.confirm_message')}
        confirmText={t('admin.bulk.confirm_delete')}
        cancelText={t('admin.shared.cancel')}
        isDestructive
      />
      {stepUp.dialog}
    </>
  );

  return { box, bar, dialogs };
}
