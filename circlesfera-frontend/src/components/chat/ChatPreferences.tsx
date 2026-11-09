import {
  CHAT_MUTE_DURATIONS,
  type ChatMuteDuration,
} from '@circlesfera/shared';
import { useQueryClient } from '@tanstack/react-query';
import { BellOff, Pin } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { chatApi } from '../../services/chat.service';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { CREATE_PANEL } from '../create-post/createStyles';
import { Switch } from '../ui/Switch';

// A mute this far ahead was asked for "always".
const ALWAYS_FROM_YEAR = 9000;

export interface ChatPreferenceValues {
  mutedUntil?: Date | string | null;
  pinnedAt?: Date | string | null;
}

interface ChatPreferencesProps extends ChatPreferenceValues {
  conversationId: string;
  // A message request cannot be pinned until it is accepted.
  canPin: boolean;
  onChange: (values: ChatPreferenceValues) => void;
}

/**
 * The viewer's own choices for a chat, as Instagram's: mute its messages
 * for a while or for good, and pin it at the top of the inbox. Nobody else
 * in the chat sees either.
 */
export default function ChatPreferences({
  conversationId,
  mutedUntil,
  pinnedAt,
  canPin,
  onChange,
}: ChatPreferencesProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [choosingMute, setChoosingMute] = useState(false);
  const [busy, setBusy] = useState(false);

  const mutedEnd = mutedUntil ? new Date(mutedUntil) : null;
  const isMuted = Boolean(mutedEnd && mutedEnd.getTime() > Date.now());
  const mutedHint = !isMuted
    ? t('chat.preferences.mute_hint')
    : (mutedEnd as Date).getFullYear() >= ALWAYS_FROM_YEAR
      ? t('chat.preferences.muted_always')
      : t('chat.preferences.muted_until', {
          time: (mutedEnd as Date).toLocaleString(i18n.language, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }),
        });

  const run = async (
    call: () => Promise<{ data: ChatPreferenceValues }>,
    errorKey: string,
  ) => {
    setBusy(true);
    try {
      const { data } = await call();
      onChange(data);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (error) {
      toast.error(apiErrorMessage(error, t, errorKey));
    } finally {
      setBusy(false);
    }
  };

  const mute = (duration: ChatMuteDuration) => {
    setChoosingMute(false);
    void run(
      () => chatApi.muteConversation(conversationId, duration),
      'chat.preferences.error',
    );
  };

  return (
    <div className={`${CREATE_PANEL} divide-y divide-white/8`}>
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 shrink-0 rounded-full bg-white/8 text-white/80 flex items-center justify-center">
            <BellOff size={18} aria-hidden="true" />
          </span>
          <Switch
            className="flex-1 min-w-0"
            compact
            label={t('chat.preferences.mute')}
            description={mutedHint}
            checked={isMuted || choosingMute}
            disabled={busy}
            onChange={() => {
              if (isMuted) {
                void run(
                  () => chatApi.unmuteConversation(conversationId),
                  'chat.preferences.error',
                );
              } else {
                setChoosingMute((open) => !open);
              }
            }}
          />
        </div>
        {choosingMute && !isMuted && (
          // biome-ignore lint/a11y/useSemanticElements: a fieldset draws its own frame; this is a group of choices
          <div
            role="group"
            aria-label={t('chat.preferences.mute_for')}
            className="mt-3 flex flex-wrap gap-2"
          >
            {CHAT_MUTE_DURATIONS.map((duration) => (
              <button
                key={duration}
                type="button"
                disabled={busy}
                onClick={() => mute(duration)}
                className="min-h-11 rounded-full border border-white/12 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
              >
                {t(`chat.preferences.durations.${duration}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      {canPin && (
        <div className="px-4 py-3 flex items-center gap-3">
          <span className="w-10 h-10 shrink-0 rounded-full bg-white/8 text-white/80 flex items-center justify-center">
            <Pin size={18} aria-hidden="true" />
          </span>
          <Switch
            className="flex-1 min-w-0"
            compact
            label={t('chat.preferences.pin')}
            description={t('chat.preferences.pin_hint')}
            checked={Boolean(pinnedAt)}
            disabled={busy}
            onChange={() =>
              void run(
                () =>
                  pinnedAt
                    ? chatApi.unpinConversation(conversationId)
                    : chatApi.pinConversation(conversationId),
                'chat.preferences.error',
              )
            }
          />
        </div>
      )}
    </div>
  );
}
