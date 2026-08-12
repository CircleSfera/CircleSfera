import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Profile } from '../types';
import { EmptyState } from './ErrorEmptyStates';
import UserAvatar from './UserAvatar';
import { Dialog } from './ui/Dialog';

interface FollowersModalProps {
  title: string;
  users: Profile[];
  onClose: () => void;
}

export default function FollowersModal({
  title,
  users,
  onClose,
}: FollowersModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleUserClick = (username: string) => {
    navigate(`/${username}`);
    onClose();
  };

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={t(`profile.stats.${title}`)}
      maxWidth="sm"
      className="max-h-[60vh]"
    >
      {users.length === 0 ? (
        <EmptyState
          icon="followers"
          title={t('profile.empty.no_users_found')}
        />
      ) : (
        <div className="space-y-1 -mx-1">
          {users.map((profile) => (
            <button
              type="button"
              key={profile.id}
              onClick={() => handleUserClick(profile.username)}
              className="w-full flex items-center gap-3 p-3 min-h-11 hover:bg-white/5 rounded-lg transition-colors text-left"
            >
              <UserAvatar
                src={profile.avatar || undefined}
                thumbnailUrl={profile.thumbnailUrl || undefined}
                standardUrl={profile.standardUrl || undefined}
                alt={profile.username}
                size="md"
              />
              <div>
                <div className="font-semibold text-white">
                  {profile.username}
                </div>
                <div className="text-sm text-white/60">{profile.fullName}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
