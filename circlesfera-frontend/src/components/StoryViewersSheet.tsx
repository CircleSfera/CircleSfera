import { Eye, HelpCircle, MoreHorizontal, X } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserWithProfile } from '../types';
import UserAvatar from './UserAvatar';
import VerificationBadge, { type VerificationLevel } from './VerificationBadge';

export type StoryQnaAnswer = {
  id: string;
  answerText: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    fullName?: string;
    avatar?: string | null;
  };
};

interface StoryViewersSheetProps {
  viewers: UserWithProfile[];
  isLoading: boolean;
  onClose: (e?: React.MouseEvent) => void;
  // Q&A answers for this story (owner insights). Omit when story has no QnA.
  qnaAnswers?: StoryQnaAnswer[];
  isLoadingQna?: boolean;
  qnaPrompt?: string | null;
  hasQna?: boolean;
}

type SheetTab = 'views' | 'questions';

export function StoryViewersSheet({
  viewers,
  isLoading,
  onClose,
  qnaAnswers = [],
  isLoadingQna = false,
  qnaPrompt,
  hasQna = false,
}: StoryViewersSheetProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SheetTab>(hasQna ? 'questions' : 'views');

  return (
    <>
      <button
        type="button"
        aria-label={t('common.close', 'Close')}
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
        <button
          type="button"
          aria-label={t('common.close', 'Close')}
          className="w-full flex justify-center pt-3 pb-1"
          onClick={onClose}
        >
          <div className="w-12 h-1.5 bg-white/20 rounded-full" />
        </button>

        <div className="px-4 pb-3 border-b border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 id="viewers-title" className="text-white font-bold text-lg">
              {hasQna
                ? t('story.insights_title', 'Story activity')
                : t('story.viewers')}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-white/60 hover:text-white bg-white/5 p-1 rounded-full"
              aria-label={t('common.close', 'Close')}
            >
              <X size={20} />
            </button>
          </div>

          {hasQna ? (
            <div
              className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5"
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'questions'}
                onClick={() => setTab('questions')}
                className={`min-h-11 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  tab === 'questions'
                    ? 'bg-white text-black'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <HelpCircle size={14} />
                {t('story.questions_tab', 'Questions')}
                <span className="text-xs opacity-70">
                  ({qnaAnswers.length})
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'views'}
                onClick={() => setTab('views')}
                className={`min-h-11 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  tab === 'views'
                    ? 'bg-white text-black'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Eye size={14} />
                {t('story.views_tab', 'Views')}
                <span className="text-xs opacity-70">({viewers.length})</span>
              </button>
            </div>
          ) : (
            <p className="text-white/50 text-sm flex items-center gap-2">
              {t('story.viewers')}{' '}
              <span className="bg-white/10 text-xs px-2 py-0.5 rounded-full text-white/80">
                {viewers.length}
              </span>
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {hasQna && tab === 'questions' ? (
            isLoadingQna ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/20 border-t-purple-500" />
              </div>
            ) : qnaAnswers.length > 0 ? (
              <div className="space-y-2 p-1">
                {qnaPrompt ? (
                  <p className="px-3 pt-1 pb-2 text-xs text-white/40">
                    {t('story.qna_prompt_label', 'Prompt')}: {qnaPrompt}
                  </p>
                ) : null}
                {qnaAnswers.map((answer) => (
                  <div
                    key={answer.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-white/5 bg-white/3"
                  >
                    <UserAvatar
                      src={answer.user.avatar || undefined}
                      alt={answer.user.username}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">
                        @{answer.user.username}
                      </p>
                      {answer.user.fullName ? (
                        <p className="text-white/40 text-xs truncate">
                          {answer.user.fullName}
                        </p>
                      ) : null}
                      <p className="text-white/90 text-sm mt-1.5 leading-snug">
                        {answer.answerText}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 opacity-40">
                <HelpCircle size={48} className="mb-3 text-white/50" />
                <p className="text-white font-medium">
                  {t('story.no_questions', 'No questions yet')}
                </p>
                <p className="text-white/50 text-sm text-center px-8">
                  {t(
                    'story.no_questions_desc',
                    'When people answer your Q&A sticker, they show up here.',
                  )}
                </p>
              </div>
            )
          ) : isLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/20 border-t-blue-500" />
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
                    aria-label={t('common.more', 'More')}
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
