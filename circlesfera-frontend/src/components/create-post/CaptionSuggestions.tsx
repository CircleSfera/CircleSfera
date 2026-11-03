import { useQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { searchApi } from '../../services/search.service';
import { type CaptionToken, SUGGEST_MIN_CHARS } from '../../utils/captionToken';
import UserAvatar from '../UserAvatar';

/** How long the writing rests before the people or tags are looked up. */
const SUGGEST_DELAY_MS = 250;

/**
 * Who or what tag is meant while a caption is written: the people whose name
 * starts like the word after @, or the tags holding the word after #. A tap
 * puts the one chosen in the caption.
 */
export default function CaptionSuggestions({
  token,
  onPick,
}: {
  token: CaptionToken;
  onPick: (value: string) => void;
}) {
  const { t } = useTranslation();
  const query = useDebouncedValue(token.query, SUGGEST_DELAY_MS);
  const enabled = query.length >= SUGGEST_MIN_CHARS;
  const { data: people = [] } = useQuery({
    queryKey: ['caption-suggest', 'people', query],
    queryFn: () => searchApi.searchUsers(query).then((r) => r.data),
    enabled: enabled && token.kind === 'mention',
  });
  const { data: tags = [] } = useQuery({
    queryKey: ['caption-suggest', 'tags', query],
    queryFn: () => searchApi.searchHashtags(query).then((r) => r.data),
    enabled: enabled && token.kind === 'hashtag',
  });

  const items =
    token.kind === 'mention'
      ? people.slice(0, 5).map((p) => ({
          key: p.id,
          value: p.username,
          label: `@${p.username}`,
          aside: p.fullName ?? '',
          avatar: p.avatar,
        }))
      : tags.map((h) => ({
          key: h.id,
          value: h.tag,
          label: `#${h.tag}`,
          aside:
            h.postCount !== undefined
              ? t('createPost.caption.tag_posts', { count: h.postCount })
              : '',
          avatar: null,
        }));
  if (!enabled || items.length === 0) return null;

  return (
    <ul
      aria-label={t('createPost.caption.suggestions')}
      className="mt-1 overflow-hidden rounded-2xl border border-white/10 bg-surface-raised/95 backdrop-blur-xl"
    >
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            // Kept from taking the focus, so the caption stays where it was.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(item.value)}
            className="flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-white/5"
          >
            {token.kind === 'mention' ? (
              <UserAvatar src={item.avatar ?? undefined} alt="" size="sm" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5">
                <Hash size={16} aria-hidden />
              </span>
            )}
            <span className="min-w-0 shrink-0 truncate text-sm font-semibold text-white">
              {item.label}
            </span>
            <span className="flex-1" />
            {item.aside ? (
              <span className="max-w-[40%] shrink truncate text-xs text-white/50">
                {item.aside}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
