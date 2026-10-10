import { ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CREATE_GLASS_CHIP,
  CREATE_PANEL,
  CREATE_PRIMARY,
} from '../create-post/createStyles';
import UserAvatar from '../UserAvatar';
import { Dialog } from '../ui/Dialog';

interface ChatDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  person: {
    username: string;
    name: string;
    avatar?: string | null;
    thumbnailUrl?: string | null;
    standardUrl?: string | null;
  };
  isEncrypted: boolean;
  onViewProfile: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}

/**
 * The details of a conversation with one person, opened from its header:
 * who it is, the way to their profile and what can be done with the
 * conversation. The header opens this instead of leaving for the profile.
 */
export default function ChatDetailsModal({
  isOpen,
  onClose,
  person,
  isEncrypted,
  onViewProfile,
  onDeleteForMe,
  onDeleteForEveryone,
}: ChatDetailsModalProps) {
  const { t } = useTranslation();

  const deletions = [
    {
      label: t('chat.delete_for_me'),
      hint: t('chat.details.delete_for_me_hint'),
      onClick: onDeleteForMe,
    },
    {
      label: t('chat.delete_for_everyone'),
      hint: t('chat.details.delete_for_everyone_hint'),
      onClick: onDeleteForEveryone,
    },
  ];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="sm"
      ariaLabel={t('chat.details.title')}
      className="rounded-3xl! overflow-hidden"
      noPadding
    >
      {/* The person, over a soft wash of the brand colours. */}
      <div className="relative px-6 pt-10 pb-6 flex flex-col items-center text-center">
        <div
          className="absolute inset-x-0 top-0 h-36 bg-linear-to-b from-brand-primary/25 via-brand-blue/10 to-transparent pointer-events-none"
          aria-hidden="true"
        />
        <div className="relative rounded-full p-1 bg-linear-to-br from-brand-secondary to-brand-primary shadow-xl shadow-brand-primary/25">
          <div className="rounded-full bg-surface-base p-0.5">
            <UserAvatar
              src={person.avatar || undefined}
              thumbnailUrl={person.thumbnailUrl || undefined}
              standardUrl={person.standardUrl || undefined}
              alt={person.username || person.name}
              size="profile"
            />
          </div>
        </div>
        <h2 className="relative mt-4 text-xl font-bold text-white tracking-tight">
          {person.name}
        </h2>
        {person.username && (
          <p className="relative text-sm text-white/55">@{person.username}</p>
        )}
        {isEncrypted && (
          <p
            className={`relative mt-3 gap-1.5 text-emerald-400! ${CREATE_GLASS_CHIP}`}
            title={t('chat.e2ee')}
          >
            <ShieldCheck size={14} className="shrink-0" aria-hidden="true" />
            {t('chat.details.encrypted')}
          </p>
        )}

        <button
          type="button"
          onClick={onViewProfile}
          className={`relative mt-6 w-full ${CREATE_PRIMARY}`}
        >
          <UserRound size={18} aria-hidden="true" />
          {t('chat.details.view_profile')}
        </button>
      </div>

      {/* What can be done with the conversation. */}
      <div className="px-4 pb-4">
        <div className={`${CREATE_PANEL} overflow-hidden`}>
          {deletions.map(({ label, hint, onClick }, index) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className={`w-full min-h-16 px-4 py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-white/5 outline-none focus-visible:bg-white/8 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40 ${
                index > 0 ? 'border-t border-white/8' : ''
              }`}
            >
              <span className="w-10 h-10 shrink-0 rounded-full bg-brand-secondary/12 text-brand-secondary flex items-center justify-center">
                <Trash2 size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-brand-secondary">
                  {label}
                </span>
                <span className="block text-xs text-white/50">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
