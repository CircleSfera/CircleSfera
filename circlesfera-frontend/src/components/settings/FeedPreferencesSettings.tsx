import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Hash, UserX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';
import { usersApi } from '../../services/users.service';
import { Button, Switch } from '../ui';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

export default function FeedPreferencesSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [contentPreference, setContentPreference] = useState<
    'GENERAL' | 'MATURE'
  >('GENERAL');
  const [blurSensitiveContent, setBlurSensitiveContent] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    usersApi
      .getSettings()
      .then((response) => {
        const settings = response.data;
        if (settings.contentPreference !== undefined) {
          setContentPreference(settings.contentPreference);
        }
        if (settings.blurSensitiveContent !== undefined) {
          setBlurSensitiveContent(settings.blurSensitiveContent);
        }
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));
  }, []);

  const updateSetting = (key: string, value: string | boolean) => {
    usersApi
      .updateSettings({ [key]: value })
      .then(() => {
        toast.success(t('feedPrefs.updated', 'Settings updated'));
      })
      .catch(() => {
        toast.error(t('feedPrefs.update_error', 'Failed to update settings'));
      });
  };

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
      <p className="text-white/50 text-sm">
        {t('common.loading', 'Loading...')}
      </p>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      {settingsLoaded && (
        <SettingsSection
          title={t('feedPrefs.content_title', 'Content preferences')}
          description={t(
            'feedPrefs.content_surface',
            'Following shows people you chose. For You and Explore respect this setting, muted keywords, and Not interested.',
          )}
        >
          <SettingsRow
            label={t(
              'feedPrefs.show_sensitive',
              'Show sensitive content in For You and Explore',
            )}
            description={t(
              'feedPrefs.show_sensitive_desc',
              'Graphic violence, strong language, or artistic context. Explicit sexual content is not allowed on CircleSfera and is removed, not filtered.',
            )}
            control={
              <Switch
                checked={contentPreference === 'MATURE'}
                onChange={(e) => {
                  const pref = e.target.checked ? 'MATURE' : 'GENERAL';
                  setContentPreference(pref);
                  updateSetting('contentPreference', pref);
                }}
                aria-label={t(
                  'feedPrefs.show_sensitive',
                  'Show sensitive content in For You and Explore',
                )}
              />
            }
          />
          <SettingsRow
            label={t('feedPrefs.blur_sensitive', 'Blur sensitive content')}
            description={t(
              'feedPrefs.blur_desc',
              'Hide potentially sensitive images until you click.',
            )}
            control={
              <div className="flex items-center gap-2">
                {blurSensitiveContent ? (
                  <EyeOff size={16} className="text-white/40" aria-hidden />
                ) : (
                  <Eye size={16} className="text-white/40" aria-hidden />
                )}
                <Switch
                  checked={blurSensitiveContent}
                  onChange={(e) => {
                    setBlurSensitiveContent(e.target.checked);
                    updateSetting('blurSensitiveContent', e.target.checked);
                  }}
                  aria-label={t(
                    'feedPrefs.blur_sensitive',
                    'Blur sensitive content',
                  )}
                />
              </div>
            }
          />
        </SettingsSection>
      )}

      <SettingsSection
        title={t('feedPrefs.keywords_title', 'Muted keywords')}
        description={t(
          'feedPrefs.keywords_desc',
          'Posts whose caption contains these words will be hidden from your feed.',
        )}
        card={false}
      >
        <form
          className="flex gap-2 mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (keyword.trim().length >= 2) muteKeyword.mutate(keyword.trim());
          }}
        >
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('feedPrefs.keyword_placeholder', 'e.g. spoiler')}
            className="flex-1 min-h-11 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <Button
            type="submit"
            isLoading={muteKeyword.isPending}
            className="min-h-11"
          >
            {t('feedPrefs.mute', 'Mute')}
          </Button>
        </form>
        <ul className="space-y-2">
          {(data?.mutedKeywords || []).map(
            (k: { keyword: string; createdAt: string }) => (
              <li
                key={k.keyword}
                className="flex items-center justify-between p-3 min-h-11 rounded-lg bg-white/5"
              >
                <span className="text-white text-sm font-medium flex items-center gap-2">
                  <Hash size={14} className="text-brand-primary" aria-hidden />
                  {k.keyword}
                </span>
                <button
                  type="button"
                  onClick={() => unmuteKeyword.mutate(k.keyword)}
                  className="p-2 min-h-11 min-w-11 flex items-center justify-center text-white/40 hover:text-white"
                  aria-label={t('feedPrefs.unmute', 'Unmute')}
                >
                  <X size={16} />
                </button>
              </li>
            ),
          )}
          {(data?.mutedKeywords || []).length === 0 && (
            <p className="text-white/40 text-sm">
              {t('feedPrefs.no_keywords', 'No muted keywords yet.')}
            </p>
          )}
        </ul>
      </SettingsSection>

      <SettingsSection
        title={t('feedPrefs.authors_title', 'Hidden authors')}
        card={false}
      >
        <ul className="space-y-2">
          {(data?.hiddenAuthors || []).map(
            (a: {
              authorId: string;
              username?: string;
              avatar?: string | null;
            }) => (
              <li
                key={a.authorId}
                className="flex items-center justify-between p-3 min-h-11 rounded-lg bg-white/5"
              >
                <span className="text-white text-sm flex items-center gap-2">
                  <UserX size={14} className="text-brand-primary" aria-hidden />
                  @{a.username || a.authorId.slice(0, 8)}
                </span>
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() => unhideAuthor.mutate(a.authorId)}
                  className="min-h-11"
                >
                  {t('feedPrefs.show_again', 'Show again')}
                </Button>
              </li>
            ),
          )}
          {(data?.hiddenAuthors || []).length === 0 && (
            <p className="text-white/40 text-sm">
              {t('feedPrefs.no_authors', 'No hidden authors.')}
            </p>
          )}
        </ul>
      </SettingsSection>

      <SettingsSection
        title={t('feedPrefs.posts_title', 'Hidden posts')}
        card={false}
      >
        <ul className="space-y-2">
          {(data?.hiddenPosts || []).map(
            (p: { postId: string; createdAt: string }) => (
              <li
                key={p.postId}
                className="flex items-center justify-between p-3 min-h-11 rounded-lg bg-white/5"
              >
                <span className="text-white/60 text-xs font-mono flex items-center gap-2">
                  <EyeOff
                    size={14}
                    className="text-brand-primary"
                    aria-hidden
                  />
                  {p.postId.slice(0, 12)}…
                </span>
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() => unhidePost.mutate(p.postId)}
                  className="min-h-11"
                >
                  {t('feedPrefs.show_again', 'Show again')}
                </Button>
              </li>
            ),
          )}
          {(data?.hiddenPosts || []).length === 0 && (
            <p className="text-white/40 text-sm">
              {t('feedPrefs.no_posts', 'No hidden posts.')}
            </p>
          )}
        </ul>
      </SettingsSection>
    </div>
  );
}
