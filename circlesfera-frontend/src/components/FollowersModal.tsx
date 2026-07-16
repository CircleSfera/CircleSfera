import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Profile } from '../types';
import UserAvatar from './UserAvatar';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-white/10 w-full max-w-sm rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[60vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="w-8"></div>
          <h2 className="font-bold text-lg text-white capitalize">
            {t(`profile.stats.${title}`)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-gray-300"
          >
            <X size={24} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {t('profile.empty.no_users_found')}
            </div>
          ) : (
            <div className="space-y-1">
              {users.map((profile) => (
                <button
                  type="button"
                  key={profile.id}
                  onClick={() => handleUserClick(profile.username)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg transition-colors text-left"
                >
                  <UserAvatar
                    src={profile.avatar || undefined}
                    thumbnailUrl={profile.thumbnailUrl || undefined}
                    standardUrl={profile.standardUrl || undefined}
                    alt={profile.username}
                    className="w-10 h-10"
                  />
                  <div>
                    <div className="font-semibold text-white">
                      {profile.username}
                    </div>
                    <div className="text-sm text-gray-300">
                      {profile.fullName}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
