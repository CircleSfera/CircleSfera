import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '../ui';

interface AdvancedSettingsSubScreenProps {
  hideLikes: boolean;
  setHideLikes: (value: boolean) => void;
  turnOffComments: boolean;
  setTurnOffComments: (value: boolean) => void;
  isSensitive: boolean;
  setIsSensitive: (value: boolean) => void;
  showSensitiveToggle: boolean;
  scheduledAt: string;
  setScheduledAt: (value: string) => void;
  onClose: () => void;
}

export default function AdvancedSettingsSubScreen({
  hideLikes,
  setHideLikes,
  turnOffComments,
  setTurnOffComments,
  isSensitive,
  setIsSensitive,
  showSensitiveToggle,
  scheduledAt,
  setScheduledAt,
  onClose,
}: AdvancedSettingsSubScreenProps) {
  const { t } = useTranslation();
  const minSchedule = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

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
          {t('createPost.caption.advanced_settings')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <Switch
          role="switch"
          checked={hideLikes}
          onChange={(e) => setHideLikes(e.target.checked)}
          label={t('createPost.caption.hide_like_view')}
          description={t('createPost.caption.hide_like_view_desc')}
          aria-label={t('createPost.caption.hide_like_view')}
        />

        <Switch
          role="switch"
          checked={turnOffComments}
          onChange={(e) => setTurnOffComments(e.target.checked)}
          label={t('createPost.caption.turn_off_comments')}
          description={t('createPost.caption.turn_off_comments_desc')}
          aria-label={t('createPost.caption.turn_off_comments')}
        />

        {showSensitiveToggle ? (
          <Switch
            role="switch"
            checked={isSensitive}
            onChange={(e) => setIsSensitive(e.target.checked)}
            label={t('createPost.caption.mark_sensitive')}
            description={t('createPost.caption.mark_sensitive_desc')}
            aria-label={t('createPost.caption.mark_sensitive')}
          />
        ) : null}

        <div className="space-y-2">
          <div className="font-medium text-white text-sm">
            {t('createPost.caption.schedule')}
          </div>
          <div className="text-xs text-white/50">
            {t('createPost.caption.schedule_desc')}
          </div>
          <input
            type="datetime-local"
            min={minSchedule}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full min-h-12 rounded-xl bg-surface-raised border border-white/10 px-3 py-2 text-white text-base outline-none focus:ring-2 focus:ring-brand-primary/40"
          />
          {scheduledAt ? (
            <button
              type="button"
              onClick={() => setScheduledAt('')}
              className="text-sm text-brand-primary hover:underline min-h-11"
            >
              {t('createPost.caption.clear_schedule')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
