import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui/Dialog';

interface LiveGoalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (goal: { title: string; target: number }) => void;
}

const MAX_TITLE = 60;
const MAX_TARGET = 1_000_000;

/** Lets the host set the goal of the live: a short title and a target number. */
export default function LiveGoalDialog({
  isOpen,
  onClose,
  onSave,
}: LiveGoalDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');

  const targetNumber = Number(target);
  const isValid =
    title.trim().length > 0 &&
    Number.isInteger(targetNumber) &&
    targetNumber >= 1 &&
    targetNumber <= MAX_TARGET;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('live.goal.dialog_title')}
      maxWidth="sm"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isValid) return;
          onSave({ title: title.trim(), target: targetNumber });
          setTitle('');
          setTarget('');
        }}
      >
        <label className="flex flex-col gap-2 text-sm text-white/70">
          {t('live.goal.title_label')}
          <input
            type="text"
            value={title}
            maxLength={MAX_TITLE}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('live.goal.title_default')}
            className="min-h-12 rounded-xl bg-white/10 border border-white/10 px-4 text-base text-white placeholder-white/40 outline-none focus:border-brand-primary"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-white/70">
          {t('live.goal.target_label')}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_TARGET}
            step={1}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="1000"
            className="min-h-12 rounded-xl bg-white/10 border border-white/10 px-4 text-base text-white placeholder-white/40 outline-none focus:border-brand-primary"
          />
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-12 rounded-full bg-white/10 hover:bg-white/16 text-sm font-semibold text-white transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="flex-1 min-h-12 rounded-full bg-brand-primary text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
          >
            {t('live.goal.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
