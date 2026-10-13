import { Target } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CREATE_PRIMARY } from '../create-post/createStyles';
import { LiveSheet } from './LivePieces';

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
    <LiveSheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('live.goal.dialog_title')}
      icon={<Target size={20} className="shrink-0" aria-hidden />}
    >
      <form
        className="flex flex-col gap-3 pb-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isValid) return;
          onSave({ title: title.trim(), target: targetNumber });
          setTitle('');
          setTarget('');
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm text-white/70">
          {t('live.goal.title_label')}
          <input
            type="text"
            value={title}
            maxLength={MAX_TITLE}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('live.goal.title_default')}
            className="min-h-12 rounded-full border border-white/15 bg-white/10 px-4 text-base text-white placeholder-white/40 outline-none focus:border-white/40"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-white/70">
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
            className="min-h-12 rounded-full border border-white/15 bg-white/10 px-4 text-base text-white placeholder-white/40 outline-none focus:border-white/40"
          />
        </label>
        <button
          type="submit"
          disabled={!isValid}
          className={`w-full ${CREATE_PRIMARY}`}
        >
          {t('live.goal.save')}
        </button>
      </form>
    </LiveSheet>
  );
}
