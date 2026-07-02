import { LogOut, Shield, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import type { Conversation } from '../../types';
import UserAvatar from '../UserAvatar';

interface GroupDetailsModalProps {
  conversation: Conversation;
  onClose: () => void;
  onUpdate: (data: { name?: string; avatarUrl?: string }) => void;
  onRemoveParticipant: (userId: string) => void;
  onLeaveGroup: () => void;
}

export default function GroupDetailsModal({
  conversation,
  onClose,
  onUpdate,
  onRemoveParticipant,
  onLeaveGroup,
}: GroupDetailsModalProps) {
  const { profile } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(conversation.name || '');
  const [editAvatarUrl, setEditAvatarUrl] = useState(
    conversation.avatarUrl || '',
  );

  const myId = profile?.user?.id || profile?.id;
  const myParticipant = conversation.participants.find(
    (p) => p.userId === myId,
  );
  const isAdmin = myParticipant?.isAdmin || false;

  const handleSave = () => {
    onUpdate({ name: editName, avatarUrl: editAvatarUrl });
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default w-full h-full border-none"
        onClick={onClose}
        aria-label="Cerrar modal"
      />
      <div
        className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col shadow-2xl relative z-10"
        role="dialog"
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-zinc-900 z-10">
          <h2 className="font-bold text-lg text-white">Detalles del Grupo</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex-1 custom-scrollbar">
          {/* Header Info */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-24 h-24 mb-4">
              {conversation.avatarUrl ? (
                <img
                  src={conversation.avatarUrl}
                  alt={conversation.name || 'Group'}
                  className="w-full h-full object-cover rounded-full border-2 border-zinc-800"
                />
              ) : (
                <div className="w-full h-full bg-zinc-800 rounded-full flex items-center justify-center border-2 border-zinc-700">
                  <span className="text-3xl text-zinc-500">
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
                    Nombre del grupo
                  </label>
                  <input
                    id="groupName"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                    placeholder="Nombre del grupo"
                  />
                </div>
                <div>
                  <label
                    htmlFor="groupAvatar"
                    className="text-xs text-white/50 mb-1 block"
                  >
                    URL de la imagen (opcional)
                  </label>
                  <input
                    id="groupAvatar"
                    type="text"
                    value={editAvatarUrl}
                    onChange={(e) => setEditAvatarUrl(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                    placeholder="https://..."
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-sm text-white/70 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-white mb-1">
                  {conversation.name || 'Chat Grupal'}
                </h3>
                <p className="text-sm text-white/50">
                  {conversation.participants.length} miembros
                </p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="mt-3 text-sm text-blue-400 hover:text-blue-300 font-medium px-4 py-1.5 bg-blue-500/10 rounded-full"
                  >
                    Editar Información
                  </button>
                )}
              </>
            )}
          </div>

          <hr className="border-white/5 my-4" />

          {/* Participants */}
          <div>
            <h4 className="text-sm font-semibold text-white/70 mb-3 px-1">
              Participantes
            </h4>
            <div className="space-y-2">
              {conversation.participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 hover:bg-white/5 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      src={p.user?.profile.avatar ?? ''}
                      alt={p.user?.profile.username ?? 'User'}
                      className="w-10 h-10"
                    />
                    <div>
                      <div className="font-medium text-white flex items-center gap-2">
                        {p.user?.profile.fullName || p.user?.profile.username}
                        {p.isAdmin && (
                          <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            <Shield size={10} /> Admin
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-white/50">
                        @{p.user?.profile.username}
                      </div>
                    </div>
                  </div>

                  {isAdmin && p.userId !== myId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `¿Estás seguro de que deseas eliminar a ${p.user?.profile.username}?`,
                          )
                        ) {
                          onRemoveParticipant(p.userId);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full transition-all"
                      title="Expulsar del grupo"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 bg-black/20">
          <button
            type="button"
            onClick={() => {
              if (
                confirm('¿Estás seguro de que quieres abandonar este grupo?')
              ) {
                onLeaveGroup();
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 font-medium transition-colors"
          >
            <LogOut size={18} />
            Abandonar Grupo
          </button>
        </div>
      </div>
    </div>
  );
}
