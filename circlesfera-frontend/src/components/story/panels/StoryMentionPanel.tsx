import { useQuery } from '@tanstack/react-query';
import { AtSign, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { searchApi } from '../../../services';
import type { StoryElement } from '../../../types';
import UserAvatar from '../../UserAvatar';
import { buildMentionElement } from '../storyComposer.append';
import { StoryStickerSetup } from './StoryStickerSetup';

/** Sets up a mention: search for a person and choose them. */
export default function StoryMentionPanel({
  onAdd,
}: {
  onAdd: (el: StoryElement) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search.trim().replace(/^@/, ''), 300);
  const { data: people = [], isFetched } = useQuery({
    queryKey: ['searchUsers', query],
    queryFn: async () => (await searchApi.searchUsers(query)).data,
    enabled: query.length > 0,
  });

  return (
    <StoryStickerSetup
      panelKey="mention-tab"
      icon={AtSign}
      title={t('createPost.storyComposer.tool_mention')}
      hint={t('createPost.storyComposer.mention_create_hint')}
    >
      <label className="flex items-center gap-2 min-h-12 px-4 rounded-2xl bg-white/6 border border-white/10 focus-within:border-brand-primary/40">
        <Search size={16} className="shrink-0 text-white/50" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('createPost.storyComposer.mention_search')}
          aria-label={t('createPost.storyComposer.mention_search')}
          className="flex-1 min-w-0 min-h-12 bg-transparent text-base text-white outline-none placeholder:text-white/40"
        />
      </label>
      {query && isFetched && people.length === 0 ? (
        <p className="text-sm text-white/60 text-center py-2">
          {t('createPost.storyComposer.mention_no_results')}
        </p>
      ) : null}
      <ul className="space-y-1 max-h-56 overflow-y-auto">
        {people.slice(0, 8).map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => onAdd(buildMentionElement(person))}
              className="w-full min-h-12 flex items-center gap-3 px-2 py-1.5 rounded-xl text-left hover:bg-white/8 active:bg-white/12"
            >
              <UserAvatar
                src={person.avatar || undefined}
                thumbnailUrl={person.thumbnailUrl || undefined}
                alt=""
                size="md"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">
                  {person.username}
                </span>
                {person.fullName ? (
                  <span className="block truncate text-xs text-white/50">
                    {person.fullName}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </StoryStickerSetup>
  );
}
