import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff, Hash, UserX, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';
import { Button } from '../ui';

export default function FeedPreferencesSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['feed-preferences'],
    queryFn: () => api.get('/feed/preferences').then((r) => r.data),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['feed-preferences'] });

  const muteKeyword = useMutation({
    mutationFn: (kw: string) =>
      api.post('/feed/preferences/mute-keyword', { keyword: kw }),
    onSuccess: () => {
      setKeyword('');
      invalidate();
      toast.success(t('feedPrefs.keyword_muted', 'Keyword muted'));
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(
        err.response?.data?.message ||
          t('feedPrefs.error', 'Could not update preference'),
      );
    },
  });

  const unmuteKeyword = useMutation({
    mutationFn: (kw: string) =>
      api.delete(`/feed/preferences/mute-keyword/${encodeURIComponent(kw)}`),
    onSuccess: () => {
      invalidate();
      toast.success(t('feedPrefs.keyword_unmuted', 'Keyword unmuted'));
    },
  });

  const unhideAuthor = useMutation({
    mutationFn: (authorId: string) =>
      api.delete(`/feed/preferences/hide-author/${authorId}`),
    onSuccess: () => {
      invalidate();
      toast.success(t('feedPrefs.author_shown', 'Author visible again'));
    },
  });

  const unhidePost = useMutation({
    mutationFn: (postId: string) =>
      api.delete(`/feed/preferences/hide-post/${postId}`),
    onSuccess: () => {
      invalidate();
      toast.success(t('feedPrefs.post_shown', 'Post visible again'));
    },
  });

  if (isLoading) {
    return (
      <p className="text-gray-400 text-sm">
        {t('common.loading', 'Loading...')}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Hash className="w-5 h-5 text-brand-primary" />
          {t('feedPrefs.keywords_title', 'Muted keywords')}
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          {t(
            'feedPrefs.keywords_desc',
            'Posts whose caption contains these words will be hidden from your feed.',
          )}
        </p>
        <form
          className="flex gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (keyword.trim().length >= 2) muteKeyword.mutate(keyword.trim());
          }}
        >
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('feedPrefs.keyword_placeholder', 'e.g. spoiler')}
            className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <Button type="submit" isLoading={muteKeyword.isPending}>
            {t('feedPrefs.mute', 'Mute')}
          </Button>
        </form>
        <ul className="space-y-2">
          {(data?.mutedKeywords || []).map(
            (k: { keyword: string; createdAt: string }) => (
              <li
                key={k.keyword}
                className="flex items-center justify-between p-3 rounded-lg bg-white/5"
              >
                <span className="text-white text-sm font-medium">
                  {k.keyword}
                </span>
                <button
                  type="button"
                  onClick={() => unmuteKeyword.mutate(k.keyword)}
                  className="p-1.5 text-gray-400 hover:text-white"
                  aria-label={t('feedPrefs.unmute', 'Unmute')}
                >
                  <X size={16} />
                </button>
              </li>
            ),
          )}
          {(data?.mutedKeywords || []).length === 0 && (
            <p className="text-gray-500 text-sm">
              {t('feedPrefs.no_keywords', 'No muted keywords yet.')}
            </p>
          )}
        </ul>
      </div>

      <div>
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <UserX className="w-5 h-5 text-brand-primary" />
          {t('feedPrefs.authors_title', 'Hidden authors')}
        </h3>
        <ul className="space-y-2">
          {(data?.hiddenAuthors || []).map(
            (a: {
              authorId: string;
              username?: string;
              avatar?: string | null;
            }) => (
              <li
                key={a.authorId}
                className="flex items-center justify-between p-3 rounded-lg bg-white/5"
              >
                <span className="text-white text-sm">
                  @{a.username || a.authorId.slice(0, 8)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unhideAuthor.mutate(a.authorId)}
                >
                  {t('feedPrefs.show_again', 'Show again')}
                </Button>
              </li>
            ),
          )}
          {(data?.hiddenAuthors || []).length === 0 && (
            <p className="text-gray-500 text-sm">
              {t('feedPrefs.no_authors', 'No hidden authors.')}
            </p>
          )}
        </ul>
      </div>

      <div>
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <EyeOff className="w-5 h-5 text-brand-primary" />
          {t('feedPrefs.posts_title', 'Hidden posts')}
        </h3>
        <ul className="space-y-2">
          {(data?.hiddenPosts || []).map(
            (p: { postId: string; createdAt: string }) => (
              <li
                key={p.postId}
                className="flex items-center justify-between p-3 rounded-lg bg-white/5"
              >
                <span className="text-gray-300 text-xs font-mono">
                  {p.postId.slice(0, 12)}…
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unhidePost.mutate(p.postId)}
                >
                  {t('feedPrefs.show_again', 'Show again')}
                </Button>
              </li>
            ),
          )}
          {(data?.hiddenPosts || []).length === 0 && (
            <p className="text-gray-500 text-sm">
              {t('feedPrefs.no_posts', 'No hidden posts.')}
            </p>
          )}
        </ul>
      </div>
    </div>
  );
}
