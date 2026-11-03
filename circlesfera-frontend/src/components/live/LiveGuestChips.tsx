import type { LiveGuestStatus } from '@circlesfera/shared';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { initialsAvatarUrl } from '../../utils/initialsAvatar';

export interface GuestChip {
  profileId: string;
  username: string;
  avatar?: string | null;
  /** None before the live starts: chosen, to be invited at the start. */
  status?: LiveGuestStatus;
}

/**
 * The guests of a live, each in its own chip: picture, name, whether they
 * are on air, invited, or to be invited at the start, and a button to take
 * them off.
 */
export default function LiveGuestChips({
  guests,
  onRemove,
}: {
  guests: GuestChip[];
  onRemove: (profileId: string) => void;
}) {
  const { t } = useTranslation();
  if (guests.length === 0) return null;
  return (
    <ul
      className="flex min-w-0 max-w-full flex-wrap gap-2"
      aria-label={t('live.guests.list')}
    >
      {guests.map((guest) => (
        <li
          key={guest.profileId}
          className="live-glass flex min-w-0 items-center gap-2 rounded-full pl-1.5 text-xs text-white"
        >
          <img
            src={guest.avatar || initialsAvatarUrl(guest.username)}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
          <span className="min-w-0">
            <strong className="block truncate">@{guest.username}</strong>
            <span className="block text-white/70">
              {t(`live.guests.status.${guest.status ?? 'QUEUED'}`)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onRemove(guest.profileId)}
            aria-label={t('live.guests.remove', { username: guest.username })}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-white/80 hover:text-white"
          >
            <X size={18} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
