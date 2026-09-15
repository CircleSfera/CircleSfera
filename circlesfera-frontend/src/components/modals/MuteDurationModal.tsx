import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { followsApi, type MuteDuration } from '../../services';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

const DURATIONS: MuteDuration[] = ['24h', '7d', '30d', 'forever'];

interface MuteDurationModalProps {
  isOpen: boolean;
  username: string;
  onClose: () => void;
  onMuted?: (duration: MuteDuration) => void;
}

export default function MuteDurationModal({
  isOpen,
  username,
  onClose,
  onMuted,
}: MuteDurationModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<MuteDuration>('forever');
  const [isLoading, setIsLoading] = useState(false);

  const labelFor = (duration: MuteDuration) => {
    switch (duration) {
      case '24h':
        return t('mute.duration.24h');
      case '7d':
        return t('mute.duration.7d');
      case '30d':
        return t('mute.duration.30d');
      case 'forever':
        return t('mute.duration.forever');
    }
  };

  const handleConfirm = async () => {
    if (!username) return;
    setIsLoading(true);
    try {
      await followsApi.mute(username, selected);
      toast.success(t('mute.success'));
      onMuted?.(selected);
      onClose();
    } catch {
      toast.error(t('mute.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('mute.title', { username })}
      maxWidth="sm"
    >
      <div className="p-4 space-y-4">
        <p className="text-sm text-white/60">{t('mute.subtitle')}</p>
        <ul className="space-y-2">
          {DURATIONS.map((duration) => (
            <li key={duration}>
              <button
                type="button"
                onClick={() => setSelected(duration)}
                className={`w-full min-h-12 px-4 rounded-xl text-left text-sm font-semibold transition-colors border ${
                  selected === duration
                    ? 'border-brand-primary/60 bg-brand-primary/15 text-white'
                    : 'border-white/10 bg-white/2 text-white/80 hover:bg-white/5'
                }`}
              >
                {labelFor(duration)}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1 min-h-12"
            onClick={onClose}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            className="flex-1 min-h-12"
            onClick={handleConfirm}
            isLoading={isLoading}
          >
            {t('mute.confirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
