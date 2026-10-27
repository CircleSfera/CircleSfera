import { Check, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Participant } from '../../types';
import { CREATE_PRIMARY, CREATE_SECONDARY } from '../create-post/createStyles';
import UserAvatar from '../UserAvatar';
import { Dialog } from '../ui/Dialog';

interface ChooseAdminSheetProps {
  isOpen: boolean;
  onClose: () => void;
  // The members who could be admin after the person leaves.
  candidates: Participant[];
  // With a member: they become admin and the person leaves, together.
  // Without one: the person leaves and the group chooses.
  onLeave: (successorId?: string) => void;
  isLoading?: boolean;
}

/**
 * Asked when the only admin of a group leaves it: who manages the group
 * after them, or leave it to the group, which then picks the member who has
 * been in it longest.
 */
export default function ChooseAdminSheet({
  isOpen,
  onClose,
  candidates,
  onLeave,
  isLoading = false,
}: ChooseAdminSheetProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(null);

  // Each time it opens, nobody is chosen yet.
  useEffect(() => {
    if (isOpen) setChosen(null);
  }, [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="sm"
      title={t('chat.choose_admin.title')}
    >
      <p className="text-sm text-white/60 mb-4">
        {t('chat.choose_admin.description')}
      </p>

      <ul
        className="space-y-2 max-h-[40vh] overflow-y-auto custom-scrollbar -mx-1 px-1"
        aria-label={t('chat.choose_admin.members')}
      >
        {candidates.map((p) => {
          const name = p.profile?.fullName || p.profile?.username || '';
          const selected = chosen === p.profileId;
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setChosen(p.profileId)}
                className={`w-full min-h-14 px-3 py-2 flex items-center gap-3 rounded-2xl border text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                  selected
                    ? 'border-brand-primary bg-brand-primary/10'
                    : 'border-white/8 bg-white/4 hover:bg-white/8'
                }`}
              >
                <UserAvatar
                  src={p.profile?.avatar ?? ''}
                  alt={p.profile?.username ?? ''}
                  className="w-10 h-10 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white truncate">
                    {name}
                  </span>
                  <span className="block text-xs text-white/50 truncate">
                    @{p.profile?.username}
                  </span>
                </span>
                {selected && (
                  <Check
                    size={20}
                    className="shrink-0 text-brand-primary-text"
                    aria-hidden="true"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          disabled={!chosen || isLoading}
          onClick={() => chosen && onLeave(chosen)}
          className={`w-full ${CREATE_PRIMARY}`}
        >
          {t('chat.choose_admin.make_admin_and_leave')}
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onLeave()}
          className={`w-full ${CREATE_SECONDARY} text-brand-secondary!`}
        >
          <LogOut size={18} aria-hidden="true" />
          {t('chat.choose_admin.leave_and_group_chooses')}
        </button>
      </div>
    </Dialog>
  );
}
