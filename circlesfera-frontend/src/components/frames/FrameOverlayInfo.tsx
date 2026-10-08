import { MapPin, Music } from 'lucide-react';
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
      <div className="flex items-center gap-2 pointer-events-auto">
        <Link
          to={`/${post.profile.username}`}
          className="relative shrink-0 p-1.5 -m-1.5"
          aria-label={t('common.view_profile', {
            username: post.profile.username,
          })}
        >
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
              className="min-h-11 flex items-center font-bold text-sm text-white drop-shadow-md hover:underline transition-all truncate"
            >
              {post.profile.username}
            </Link>
            {!isOwner && (
              <button
                type="button"
                onClick={onFollow}
                className="group/follow min-h-11 flex items-center shrink-0 transition-transform active:scale-95"
              >
                {/* A small pill to look at, 44 px to touch. */}
                <span className="px-3 py-1 border border-white/80 rounded-full text-xs font-semibold text-white group-hover/follow:bg-white/10 transition-colors">
                  {t('suggestions.follow')}
                </span>
              </button>
            )}
          </div>

          {post.isPromoted && (
            <span className="text-xs font-bold text-amber-400 drop-shadow-md -mt-2">
              {t('post.header.promoted')}
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
              className="min-h-11 min-w-11 -my-3 text-left text-white/80 font-bold text-xs drop-shadow-md hover:text-white"
            >
              {isCaptionExpanded
                ? t('frames.caption_less')
                : t('frames.caption_more')}
            </button>
          )}
        </div>
      )}

      {(post.place?.name || post.location) && (
        <p className="pointer-events-auto mb-1.5 text-xs text-white/85 drop-shadow-md flex items-center gap-1 min-w-0">
          <MapPin size={12} className="shrink-0" aria-hidden />
          <span className="truncate">
            {post.place?.fullName || post.place?.name || post.location}
          </span>
        </p>
      )}

      <Link
        to={post.audioId ? `/audio/${post.audioId}` : '#'}
        className="min-h-11 -my-3.5 flex items-center gap-1.5 pointer-events-auto text-white drop-shadow-md hover:opacity-80 transition min-w-0"
      >
        <Music size={12} className="shrink-0" />
        <div className="overflow-hidden whitespace-nowrap max-w-44 relative mask-[linear-gradient(to_right,white_80%,transparent)]">
          <div className="animate-marquee inline-block text-xs font-medium">
            {post.audio
              ? `${post.audio.title} - ${post.audio.artist || t('frames.artist_fallback')}`
              : t('frames.original_audio', { username: post.profile.username })}
          </div>
        </div>
      </Link>
    </div>
  );
}
