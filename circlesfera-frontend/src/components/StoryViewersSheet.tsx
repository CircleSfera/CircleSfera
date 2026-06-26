import { Eye, MoreHorizontal, X } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { UserWithProfile } from '../types';
import UserAvatar from './UserAvatar';
import VerificationBadge, { type VerificationLevel } from './VerificationBadge';

interface StoryViewersSheetProps {
  viewers: UserWithProfile[];
  isLoading: boolean;
  onClose: (e?: React.MouseEvent) => void;
}

export function StoryViewersSheet({
  viewers,
  isLoading,
  onClose,
}: StoryViewersSheetProps) {
  const { t } = useTranslation();

  return (
    <>
      <button
        type="button"
        aria-label="Close viewers"
        className="absolute inset-0 bg-black/50 z-40 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="viewers-title"
        className="absolute inset-x-0 bottom-0 max-h-[70%] bg-surface-raised/95 backdrop-blur-xl rounded-t-3xl z-50 flex flex-col shadow-[0_-8px_30px_rgba(0,0,0,0.5)] border-t border-white/10 animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          e.stopPropagation();
        }}
      >
        {/* Drag Handle */}
        <button
          type="button"
          aria-label="Drag down to close"
          className="w-full flex justify-center pt-3 pb-1"
          onClick={onClose}
        >
          <div className="w-12 h-1.5 bg-white/20 rounded-full" />
        </button>

        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            {t('story.viewers')}{' '}
            <span className="bg-white/10 text-xs px-2 py-0.5 rounded-full text-white/80">
              {viewers.length}
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white bg-white/5 p-1 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/20 border-t-blue-500"></div>
            </div>
          ) : viewers.length > 0 ? (
            <div className="space-y-1">
              {viewers.map((viewer) => (
                <div
                  key={viewer.id}
                  className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition-colors cursor-pointer group"
                >
                  <UserAvatar
                    src={viewer.profile?.avatar}
                    thumbnailUrl={viewer.profile?.thumbnailUrl}
                    standardUrl={viewer.profile?.standardUrl}
                    alt={viewer.profile?.username || 'User'}
                    size="md"
                  />
                  <div className="flex-1">
                    <p className="text-white text-sm font-semibold group-hover:text-blue-400 transition-colors flex items-center gap-1">
                      {viewer.profile?.username}
                      <VerificationBadge
                        level={viewer.verificationLevel as VerificationLevel}
                        size={12}
                      />
                    </p>
                    <p className="text-white/50 text-xs">
                      {viewer.profile?.fullName}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-white/40 hover:text-white p-2"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 opacity-40">
              <Eye size={48} className="mb-3 text-white/50" />
              <p className="text-white font-medium">{t('story.no_views')}</p>
              <p className="text-white/50 text-sm">
                {t('story.viewer_list_empty')}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
