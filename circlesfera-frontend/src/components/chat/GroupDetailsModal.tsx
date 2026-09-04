import { LogOut, Shield, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import type { Conversation } from '../../types';
import UserAvatar from '../UserAvatar';
import { Dialog } from '../ui/Dialog';

interface GroupDetailsModalProps {
  isOpen: boolean;
  conversation: Conversation;
  onClose: () => void;
  onUpdate: (data: { name?: string; avatarUrl?: string }) => void;
  onRemoveParticipant: (profileId: string) => void;
  onLeaveGroup: () => void;
}

export default function GroupDetailsModal({
  isOpen,
  conversation,
  onClose,
  onUpdate,
  onRemoveParticipant,
  onLeaveGroup,
}: GroupDetailsModalProps) {
  const { t } = useTranslation();
  const profile = useAuthStore((state) => state.profile);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(conversation.name || '');
  const [editAvatarUrl, setEditAvatarUrl] = useState(
    conversation.avatarUrl || '',
  );

  const myProfileId = profile?.id;
  const myParticipant = conversation.participants.find(
    (p) => p.profileId === myProfileId,
  );
  const isAdmin = myParticipant?.isAdmin || false;

  const handleSave = () => {
    onUpdate({ name: editName, avatarUrl: editAvatarUrl });
    setIsEditing(false);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      className="max-h-[90vh]"
      title={t('chat.group_details.title')}
    >
      <div className="-mx-4 -mt-4 flex flex-col max-h-[75vh]">
        <div className="overflow-y-auto p-4 flex-1 min-h-0 custom-scrollbar">
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-24 h-24 mb-4">
              {conversation.avatarUrl ? (
                <img
                  src={conversation.avatarUrl}
                  alt={conversation.name || t('chat.group_chat')}
                  className="w-full h-full object-cover rounded-full border-2 border-zinc-800"
                />
              ) : (
                <div className="w-full h-full bg-zinc-800 rounded-full flex items-center justify-center border-2 border-zinc-700">
                  <span className="text-3xl text-zinc-400">
                    {(conversation.name || 'G').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="w-full space-y-3 mb-4">
                <div>
                  <label
                    htmlFor="groupName"
                    className="text-xs text-white/50 mb-1 block"
                  >
                    {t('chat.group_details.name_label')}
                  </label>
                  <input
                    id="groupName"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full min-h-11 bg-black border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-brand-primary"
                    placeholder={t('chat.group_details.name_label')}
                  />
                </div>
                <div>
                  <label
                    htmlFor="groupAvatar"
                    className="text-xs text-white/50 mb-1 block"
                  >
                    {t('chat.group_details.avatar_label')}
                  </label>
                  <input
                    id="groupAvatar"
                    type="url"
                    value={editAvatarUrl}
                    onChange={(e) => setEditAvatarUrl(e.target.value)}
                    className="w-full min-h-11 bg-black border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-brand-primary"
                    placeholder="https://..."
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 min-h-11 text-sm text-white/70 hover:text-white"
                  >
                    {t('chat.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="px-4 py-2 min-h-11 text-sm bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg font-medium"
                  >
                    {t('chat.group_details.save')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-white mb-1">
                  {conversation.name || t('chat.group_details.default_name')}
                </h3>
                <p className="text-sm text-white/50">
                  {t('chat.members', {
                    count: conversation.participants.length,
                  })}
                </p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="mt-3 text-sm text-brand-primary hover:text-brand-primary/80 font-medium px-4 py-1.5 bg-brand-primary/10 rounded-full min-h-11"
                  >
                    {t('chat.group_details.edit_info')}
                  </button>
                )}
              </>
            )}
          </div>

          <hr className="border-white/5 my-4" />

          <div>
            <h4 className="text-sm font-semibold text-white/70 mb-3 px-1">
              {t('chat.group_details.participants')}
            </h4>
            <div className="space-y-2">
              {conversation.participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 min-h-11 hover:bg-white/5 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      src={p.profile?.avatar ?? ''}
                      alt={p.profile?.username ?? 'User'}
                      className="w-10 h-10 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-white flex items-center gap-2 truncate">
                        {p.profile?.fullName || p.profile?.username}
                        {p.isAdmin && (
                          <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded shrink-0">
                            <Shield size={10} aria-hidden />
                            {t('chat.group_details.admin_badge')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-white/50 truncate">
                        @{p.profile?.username}
                      </div>
                    </div>
                  </div>

                  {isAdmin && p.profileId !== myProfileId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            t('chat.group_details.remove_confirm', {
                              username: p.profile?.username ?? '',
                            }),
                          )
                        ) {
                          onRemoveParticipant(p.profileId);
                        }
                      }}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 min-h-11 min-w-11 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full transition-all shrink-0"
                      title={t('chat.group_details.remove_title')}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('chat.group_details.leave_confirm'))) {
                onLeaveGroup();
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-3 min-h-11 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 font-medium transition-colors"
          >
            <LogOut size={18} aria-hidden />
            {t('chat.group_details.leave_group')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
