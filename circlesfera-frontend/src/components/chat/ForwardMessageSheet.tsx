import { CHAT_FORWARD_MAX } from '@circlesfera/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { chatApi } from '../../services/chat.service';
import type { Conversation, Participant } from '../../types';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import { BUTTON_FIT, BUTTON_ROW } from '../ui/buttonWidth';
import { Dialog } from '../ui/Dialog';
import { isUnavailable } from './unavailable';

interface ForwardMessageSheetProps {
  messageId: string;
  currentProfileId: string;
  /** The chat the message is in; it is not offered as a target. */
  fromConversationId?: string;
  onClose: () => void;
}

function chatLabel(c: Conversation, me: string) {
  if (c.isGroup) return { name: c.name ?? '', profile: undefined };
  const other = c.participants.find((p: Participant) => p.profileId !== me);
  return { name: other?.profile?.username ?? '', profile: other?.profile };
}

// Picks up to CHAT_FORWARD_MAX of the member's chats and forwards the
// message to each. The server sends each copy the normal way, so a chat
// that refuses it (a block, a request, a limit) is counted, not hidden.
export default function ForwardMessageSheet({
  messageId,
  currentProfileId,
  fromConversationId,
  onClose,
}: ForwardMessageSheetProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatApi.getConversations(),
  });

  const query = search.trim().toLowerCase();
  const chats = (data?.data ?? []).filter((c) => {
    if (c.id === fromConversationId) return false;
    if (c.participants.some((p: Participant) => isUnavailable(p.profile)))
      return false;
    return chatLabel(c, currentProfileId).name.toLowerCase().includes(query);
  });
  const full = picked.length >= CHAT_FORWARD_MAX;

  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= CHAT_FORWARD_MAX
          ? prev
          : [...prev, id],
    );

  const send = async () => {
    if (picked.length === 0 || isSending) return;
    setIsSending(true);
    try {
      const { data: result } = await chatApi.forwardMessage(messageId, picked);
      if (result.sent.length > 0) {
        toast.success(
          t('chat.forward_sheet.sent', { count: result.sent.length }),
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          t('chat.forward_sheet.partly', { count: result.failed.length }),
        );
      }
      onClose();
    } catch (error) {
      toast.error(apiErrorMessage(error, t, 'chat.forward_sheet.error'));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog
      isOpen
      onClose={onClose}
      maxWidth="md"
      title={t('chat.forward_sheet.title')}
      className="max-h-[90vh]"
    >
      <div className="flex flex-col gap-3 min-h-0">
        <div className="relative shrink-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            size={18}
            aria-hidden
          />
          <input
            type="search"
            aria-label={t('chat.forward_sheet.search')}
            placeholder={t('chat.forward_sheet.search')}
            className="w-full h-11 pl-10 pr-3 bg-white/5 border border-white/10 rounded-xl outline-none focus:border-brand-primary/50 text-white text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="text-xs text-gray-400 shrink-0">
          {t('chat.forward_sheet.limit', { count: CHAT_FORWARD_MAX })}
        </p>

        <ul className="flex-1 min-h-0 max-h-[50vh] overflow-y-auto custom-scrollbar space-y-0.5">
          {isLoading ? (
            <li className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-primary" />
            </li>
          ) : chats.length === 0 ? (
            <li className="text-center py-8 text-gray-500 text-sm">
              {t('chat.forward_sheet.none')}
            </li>
          ) : (
            chats.map((c) => {
              const { name, profile } = chatLabel(c, currentProfileId);
              const isPicked = picked.includes(c.id);
              return (
                <li key={c.id}>
                  <label
                    className={`flex items-center gap-3 px-2 py-1.5 min-h-11 rounded-xl cursor-pointer hover:bg-white/5 ${
                      full && !isPicked ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <UserAvatar
                      src={profile?.avatar || undefined}
                      thumbnailUrl={profile?.thumbnailUrl}
                      standardUrl={profile?.standardUrl}
                      // The initials stand in for a missing picture.
                      alt={name}
                      size="md"
                      className="shrink-0"
                    />
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-white">
                      {name}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={isPicked}
                      disabled={full && !isPicked}
                      onChange={() => toggle(c.id)}
                    />
                    <span
                      aria-hidden
                      className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-primary ${
                        isPicked
                          ? 'bg-brand-primary border-brand-primary text-white'
                          : 'border-white/30'
                      }`}
                    >
                      {isPicked && <Check size={14} />}
                    </span>
                  </label>
                </li>
              );
            })
          )}
        </ul>

        <div className={`${BUTTON_ROW} shrink-0`}>
          <Button
            onClick={send}
            disabled={picked.length === 0 || isSending}
            isLoading={isSending}
            className={BUTTON_FIT}
          >
            {t('chat.forward_sheet.send', {
              count: Math.max(picked.length, 1),
            })}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
