import { useTranslation } from 'react-i18next';
import { Switch } from '../ui';
import { SUBSCREEN_BODY, SUBSCREEN_SHELL } from './ComposerChrome';
import SubScreenHeader from './SubScreenHeader';

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
    <div className={SUBSCREEN_SHELL}>
      <SubScreenHeader
        title={t('createPost.caption.advanced_settings')}
        onClose={onClose}
      />

      <div className={SUBSCREEN_BODY}>
        <div className="rounded-xl border border-white/8 bg-white/2 divide-y divide-white/6 overflow-hidden">
          <div className="px-3 py-2.5">
            <Switch
              compact
              role="switch"
              checked={hideLikes}
              onChange={(e) => setHideLikes(e.target.checked)}
              label={t('createPost.caption.hide_like_view')}
              description={t('createPost.caption.hide_like_view_desc')}
              aria-label={t('createPost.caption.hide_like_view')}
            />
          </div>

          <div className="px-3 py-2.5">
            <Switch
              compact
              role="switch"
              checked={turnOffComments}
              onChange={(e) => setTurnOffComments(e.target.checked)}
              label={t('createPost.caption.turn_off_comments')}
              description={t('createPost.caption.turn_off_comments_desc')}
              aria-label={t('createPost.caption.turn_off_comments')}
            />
          </div>

          {showSensitiveToggle ? (
            <div className="px-3 py-2.5">
              <Switch
                compact
                role="switch"
                checked={isSensitive}
                onChange={(e) => setIsSensitive(e.target.checked)}
                label={t('createPost.caption.mark_sensitive')}
                description={t('createPost.caption.mark_sensitive_desc')}
                aria-label={t('createPost.caption.mark_sensitive')}
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/8 bg-white/2 px-3 py-2.5 space-y-2">
          <div>
            <div className="font-medium text-white text-[13px] leading-snug">
              {t('createPost.caption.schedule')}
            </div>
            <div className="text-[11px] text-white/45 leading-snug">
              {t('createPost.caption.schedule_desc')}
            </div>
          </div>
          <input
            type="datetime-local"
            min={minSchedule}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full min-h-10 h-10 rounded-lg bg-surface-raised border border-white/10 px-2.5 text-white text-sm outline-none focus:ring-2 focus:ring-brand-primary/40"
          />
          {scheduledAt ? (
            <button
              type="button"
              onClick={() => setScheduledAt('')}
              className="text-xs text-brand-primary hover:underline min-h-9"
            >
              {t('createPost.caption.clear_schedule')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
