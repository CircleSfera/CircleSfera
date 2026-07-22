import { useTranslation } from 'react-i18next';

interface AdvancedSettingsSubScreenProps {
  hideLikes: boolean;
  setHideLikes: (value: boolean) => void;
  turnOffComments: boolean;
  setTurnOffComments: (value: boolean) => void;
  scheduledAt: string;
  setScheduledAt: (value: string) => void;
  onClose: () => void;
}

export default function AdvancedSettingsSubScreen({
  hideLikes,
  setHideLikes,
  turnOffComments,
  setTurnOffComments,
  scheduledAt,
  setScheduledAt,
  onClose,
}: AdvancedSettingsSubScreenProps) {
  const { t } = useTranslation();
  const minSchedule = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-white/10 w-full max-w-md rounded-lg overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-gray-300"
            aria-label="Go back"
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="font-bold text-lg">
            {t('createPost.caption.advanced_settings')}
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">
                {t('createPost.caption.hide_like_view')}
              </div>
              <div className="text-xs text-gray-300 mt-1 max-w-[280px]">
                {t('createPost.caption.hide_like_view_desc')}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hideLikes}
              onClick={() => setHideLikes(!hideLikes)}
              className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${hideLikes ? 'bg-brand-primary' : 'bg-neutral-700'}`}
              aria-label="Toggle hide like counts"
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${hideLikes ? 'left-7' : 'left-1'}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">
                {t('createPost.caption.turn_off_comments')}
              </div>
              <div className="text-xs text-gray-300 mt-1 max-w-[280px]">
                {t('createPost.caption.turn_off_comments_desc')}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={turnOffComments}
              onClick={() => setTurnOffComments(!turnOffComments)}
              className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${turnOffComments ? 'bg-brand-primary' : 'bg-neutral-700'}`}
              aria-label="Toggle commenting"
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${turnOffComments ? 'left-7' : 'left-1'}`}
              />
            </button>
          </div>

          <div className="space-y-2">
            <div className="font-medium text-white">
              {t('createPost.caption.schedule', 'Schedule publish')}
            </div>
            <div className="text-xs text-gray-300">
              {t(
                'createPost.caption.schedule_desc',
                'Leave empty to publish immediately.',
              )}
            </div>
            <input
              type="datetime-local"
              min={minSchedule}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 border border-white/10 px-3 py-2 text-white text-sm"
            />
            {scheduledAt ? (
              <button
                type="button"
                onClick={() => setScheduledAt('')}
                className="text-xs text-brand-primary hover:underline"
              >
                {t('createPost.caption.clear_schedule', 'Clear schedule')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
