import { Loader2, Star, UserCircle2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryAudience, StoryShareOptions } from './storyShare.types';

interface StoryShareRowProps {
  share: StoryShareOptions;
  canPost: boolean;
  isExporting: boolean;
  onShare: (audience: StoryAudience) => void;
}

const pill =
  'min-h-11 min-w-0 px-3 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold transition-colors active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * The bottom row of the story editor: share to your story, or to your close
 * friends only, in one tap. With nobody in the list yet, the close friends
 * button opens the list instead.
 */
export default function StoryShareRow({
  share,
  canPost,
  isExporting,
  onShare,
}: StoryShareRowProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<StoryAudience | null>(null);
  const busy = isExporting || share.isSharing;
  const disabled = !canPost || busy;

  const go = (audience: StoryAudience) => {
    if (audience === 'close_friends' && share.closeFriendsCount === 0) {
      share.onManageCloseFriends();
      return;
    }
    setChosen(audience);
    onShare(audience);
  };

  const spinner = (audience: StoryAudience) =>
    busy && chosen === audience ? (
      <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
    ) : null;

  return (
    <div className="flex w-full items-center gap-2 md:w-auto">
      <button
        type="button"
        onClick={() => go('everyone')}
        disabled={disabled}
        aria-busy={busy && chosen === 'everyone'}
        className={`${pill} flex-1 md:flex-none bg-white/12 text-white border border-white/12 hover:bg-white/18`}
      >
        {spinner('everyone') ?? (
          <UserCircle2 size={18} className="shrink-0" aria-hidden />
        )}
        {t('createPost.story.your_story')}
      </button>
      <button
        type="button"
        onClick={() => go('close_friends')}
        disabled={disabled}
        aria-busy={busy && chosen === 'close_friends'}
        className={`${pill} flex-1 md:flex-none bg-white/12 text-white border border-white/12 hover:bg-white/18`}
      >
        {spinner('close_friends') ?? (
          <Star
            size={16}
            className="shrink-0 fill-close-friends text-close-friends"
            aria-hidden
          />
        )}
        {t('createPost.story.close_friends')}
      </button>
      <button
        type="button"
        onClick={share.onManageCloseFriends}
        disabled={busy}
        aria-label={t('createPost.story.manage_close_friends')}
        title={t('createPost.story.manage_close_friends')}
        className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-full bg-white/12 border border-white/12 text-white hover:bg-white/12 outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40"
      >
        <UserPlus size={16} aria-hidden />
      </button>
    </div>
  );
}
