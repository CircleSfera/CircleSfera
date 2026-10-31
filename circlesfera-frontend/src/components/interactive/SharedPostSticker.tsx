import { Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { sanitizeUrl } from '../../utils/apiUtils';
import UserAvatar from '../UserAvatar';

/** The card of a post or Frame shared to a story, as the server sends it. */
export interface SharedPostCard {
  id: string;
  type: string;
  image: string | null;
  username: string;
  avatar: string | null;
}

/** Where the original opens: a Frame in the Frames viewer, a post on its page. */
export function sharedPostPath(card: Pick<SharedPostCard, 'id' | 'type'>) {
  return card.type === 'FRAME'
    ? `/frames?post=${encodeURIComponent(card.id)}`
    : `/p/${encodeURIComponent(card.id)}`;
}

/** The card itself: the author on top, then the picture or a video's cover. */
export function SharedPostCardView({ card }: { card: SharedPostCard }) {
  const image = card.image ? sanitizeUrl(card.image) : undefined;
  return (
    <div className="w-[180px] overflow-hidden rounded-2xl border border-white/15 bg-surface-raised shadow-xl">
      <div className="flex items-center gap-2 px-3 py-2">
        <UserAvatar
          src={card.avatar ?? ''}
          alt={card.username}
          size="compact"
          className="h-8 w-8 rounded-full object-cover"
        />
        <span className="min-w-0 truncate text-sm font-semibold text-white">
          {card.username}
        </span>
      </div>
      <div className="relative aspect-4/5 bg-black/40">
        {image && (
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
        {card.type === 'FRAME' && (
          <Play
            size={28}
            className="absolute inset-0 m-auto text-white drop-shadow-lg"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

/**
 * A post or Frame shared to a story, as a viewer sees it: the card opens the
 * original. When the original can no longer be seen, the card says so and
 * opens nothing.
 */
export function SharedPostSticker({ card }: { card: SharedPostCard | null }) {
  const { t } = useTranslation();
  if (!card) {
    return (
      <div className="flex min-h-24 w-[180px] items-center justify-center whitespace-normal break-words rounded-2xl border border-white/15 bg-surface-raised px-4 py-6 text-center text-sm font-semibold text-white/70 shadow-xl">
        {t('story.shared_post_unavailable')}
      </div>
    );
  }
  return (
    <Link
      to={sharedPostPath(card)}
      aria-label={t('story.shared_post_open', { username: card.username })}
      className="block"
    >
      <SharedPostCardView card={card} />
    </Link>
  );
}
