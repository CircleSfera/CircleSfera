import { Music } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import RichText from '../RichText';
import UserAvatar from '../UserAvatar';

interface FrameOverlayInfoProps {
  post: Post;
  isOwner: boolean;
  isCaptionExpanded: boolean;
  onCaptionExpandedChange: (expanded: boolean) => void;
  onFollow: () => void;
}

export default function FrameOverlayInfo({
  post,
  isOwner,
  isCaptionExpanded,
  onCaptionExpandedChange,
  onFollow,
}: FrameOverlayInfoProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute bottom-4 md:bottom-3 left-0 right-12 px-4 pb-1.5 flex flex-col justify-end z-20 pointer-events-none">
      <div className="flex items-center gap-2 mb-1.5 pointer-events-auto">
        <Link to={`/${post.profile.username}`} className="relative shrink-0">
          <UserAvatar
            src={post.profile.avatar}
            alt={post.profile.username || ''}
            size="sm"
            className="border border-white/20 shadow-md"
          />
        </Link>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={`/${post.profile.username}`}
              className="font-bold text-sm text-white drop-shadow-md hover:underline transition-all truncate"
            >
              {post.profile.username}
            </Link>
            {!isOwner && (
              <button
                type="button"
                onClick={onFollow}
                className="px-2.5 py-0.5 bg-transparent border border-white/80 rounded-lg text-[11px] font-semibold text-white transition-all active:scale-95 hover:bg-white/10 shrink-0"
              >
                {t('suggestions.follow', 'Follow')}
              </button>
            )}
          </div>

          {post.isPromoted && (
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 drop-shadow-md mt-0.5">
              {t('post.header.promoted', 'Promoted')}
            </span>
          )}
        </div>
      </div>

      {post.caption && (
        <div className="pointer-events-auto mb-1.5 pr-1">
          <div
            className={`text-xs md:text-sm text-white drop-shadow-md transition-all ${
              isCaptionExpanded ? '' : 'line-clamp-2'
            }`}
          >
            <RichText text={post.caption} />
          </div>
          {post.caption.length > 80 && (
            <button
              type="button"
              onClick={() => onCaptionExpandedChange(!isCaptionExpanded)}
              className="text-white/80 font-bold text-[11px] mt-0.5 drop-shadow-md hover:text-white"
            >
              {isCaptionExpanded
                ? t('frames.caption_less', 'less')
                : t('frames.caption_more', 'more')}
            </button>
          )}
        </div>
      )}

      <Link
        to={post.audioId ? `/audio/${post.audioId}` : '#'}
        className="flex items-center gap-1.5 pointer-events-auto text-white drop-shadow-md hover:opacity-80 transition min-w-0"
      >
        <Music size={12} className="shrink-0" />
        <div className="overflow-hidden whitespace-nowrap max-w-44 relative mask-[linear-gradient(to_right,white_80%,transparent)]">
          <div className="animate-marquee inline-block text-xs font-medium">
            {post.audio
              ? `${post.audio.title} - ${post.audio.artist || t('frames.artist_fallback', 'Artist')}`
              : t('frames.original_audio', {
                  username: post.profile.username,
                  defaultValue: '{{username}} • Original audio',
                })}
          </div>
        </div>
      </Link>
    </div>
  );
}
