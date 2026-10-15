import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PILL, PILL_TEXT } from '../story/storyInteractive';

/** A hashtag on a story: it opens the page of the hashtag. */
export function HashtagSticker({ tag }: { tag: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/explore/tags/${encodeURIComponent(tag)}`}
      aria-label={t('interactive.hashtag.open', { tag })}
      className={`${PILL} min-h-11`}
    >
      <span className={PILL_TEXT}>#{tag.toUpperCase()}</span>
    </Link>
  );
}

/** A mention on a story: it opens the profile of the person mentioned. */
export function MentionSticker({ username }: { username: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/${encodeURIComponent(username)}`}
      aria-label={t('interactive.mention.open', { username })}
      className={`${PILL} min-h-11`}
    >
      <span className={PILL_TEXT}>@{username.toUpperCase()}</span>
    </Link>
  );
}

/** The place of a story: it opens the place on the map. */
export function LocationSticker({
  placeId,
  name,
}: {
  placeId: string;
  name: string;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/explore/map?place=${encodeURIComponent(placeId)}`}
      aria-label={t('interactive.location.open', { name })}
      className={`${PILL} min-h-11 max-w-[260px]`}
    >
      <MapPin
        size={18}
        strokeWidth={2.6}
        className="shrink-0 text-brand-primary"
        aria-hidden
      />
      <span className={`${PILL_TEXT} truncate`}>{name.toUpperCase()}</span>
    </Link>
  );
}
