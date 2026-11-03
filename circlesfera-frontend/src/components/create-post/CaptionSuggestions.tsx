import { useQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { searchApi } from '../../services/search.service';
import { type CaptionToken, SUGGEST_MIN_CHARS } from '../../utils/captionToken';
import UserAvatar from '../UserAvatar';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';

/** How long the writing rests before the people or tags are looked up. */
const SUGGEST_DELAY_MS = 200;

/**
 * Who or what tag is meant while a caption is written, as on Instagram:
 * right after @, the people the author follows, then, letter by letter,
 * those whose username or name starts that way, the ones followed first;
 * after # and a letter, the tags holding it, most used first. A tap puts the
 * one chosen in the caption.
 */
export default function CaptionSuggestions({
  token,
  onPick,
  children,
}: {
  /** The mention or tag being written; none shows what is under it. */
  token: CaptionToken | null;
  onPick: (value: string) => void;
  /** What shows when there is nothing to suggest: the caption's options. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const query = useDebouncedValue(token?.query ?? '', SUGGEST_DELAY_MS);
  const enabled =
    token !== null && query.length >= SUGGEST_MIN_CHARS[token.kind];
  const { data: people = [] } = useQuery({
    queryKey: ['caption-suggest', 'people', query],
    queryFn: () => searchApi.suggestMentions(query).then((r) => r.data),
    enabled: enabled && token?.kind === 'mention',
  });
  const { data: tags = [] } = useQuery({
    queryKey: ['caption-suggest', 'tags', query],
    queryFn: () => searchApi.searchHashtags(query).then((r) => r.data),
    enabled: enabled && token?.kind === 'hashtag',
  });

  const empty =
    token?.kind === 'mention' ? people.length === 0 : tags.length === 0;
  if (!token || !enabled || empty) return <>{children}</>;

  // Kept from taking the focus, so the caption keeps its cursor.
  const keepFocus = (e: MouseEvent) => e.preventDefault();
  const row =
    'flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-white/5 focus-visible:bg-white/8 outline-none';

  return (
    <ul aria-label={t('createPost.caption.suggestions')} className="py-1">
      {token.kind === 'mention'
        ? people.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => onPick(person.username)}
                className={row}
              >
                <UserAvatar src={person.avatar ?? undefined} alt="" size="md" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-sm font-semibold text-white">
                      {person.username}
                    </span>
                    <VerificationBadge
                      level={
                        (person.verificationLevel ??
                          'BASIC') as VerificationLevel
                      }
                    />
                  </span>
                  {person.fullName ? (
                    <span className="truncate text-sm text-white/55">
                      {person.fullName}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))
        : tags.map((tag) => (
            <li key={tag.id}>
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => onPick(tag.tag)}
                className={row}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15">
                  <Hash size={18} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-white">
                    #{tag.tag}
                  </span>
                  {tag.postCount !== undefined ? (
                    <span className="truncate text-sm text-white/55">
                      {t('createPost.caption.tag_posts', {
                        count: tag.postCount,
                      })}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
    </ul>
  );
}
