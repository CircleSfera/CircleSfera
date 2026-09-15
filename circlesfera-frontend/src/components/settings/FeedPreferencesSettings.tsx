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
        toast.success(t('feedPrefs.updated'));
      })
      .catch(() => {
        toast.error(t('feedPrefs.update_error'));
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
      toast.success(t('feedPrefs.keyword_muted'));
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || t('feedPrefs.error'));
    },
  });

  const unmuteKeyword = useMutation({
    mutationFn: (kw: string) =>
      api.delete(`/feed/preferences/mute-keyword/${encodeURIComponent(kw)}`),
    onSuccess: () => {
      invalidate();
      toast.success(t('feedPrefs.keyword_unmuted'));
    },
  });

  const unhideAuthor = useMutation({
    mutationFn: (authorId: string) =>
      api.delete(`/feed/preferences/hide-author/${authorId}`),
    onSuccess: () => {
      invalidate();
      toast.success(t('feedPrefs.author_shown'));
    },
  });

  const unhidePost = useMutation({
    mutationFn: (postId: string) =>
      api.delete(`/feed/preferences/hide-post/${postId}`),
    onSuccess: () => {
      invalidate();
      toast.success(t('feedPrefs.post_shown'));
    },
  });

  if (isLoading) {
    return <p className="text-white/50 text-sm">{t('common.loading')}</p>;
  }

  return (
    <div className="max-w-xl space-y-6">
      {settingsLoaded && (
        <SettingsSection
          title={t('feedPrefs.content_title')}
          description={t('feedPrefs.content_surface')}
        >
          <SettingsRow
            label={t('feedPrefs.show_sensitive')}
            description={t('feedPrefs.show_sensitive_desc')}
            control={
              <Switch
                checked={contentPreference === 'MATURE'}
                onChange={(e) => {
                  const pref = e.target.checked ? 'MATURE' : 'GENERAL';
                  setContentPreference(pref);
                  updateSetting('contentPreference', pref);
                }}
                aria-label={t('feedPrefs.show_sensitive')}
              />
            }
          />
          <SettingsRow
            label={t('feedPrefs.blur_sensitive')}
            description={t('feedPrefs.blur_desc')}
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
                  aria-label={t('feedPrefs.blur_sensitive')}
                />
              </div>
            }
          />
        </SettingsSection>
      )}

      <SettingsSection
        title={t('feedPrefs.keywords_title')}
        description={t('feedPrefs.keywords_desc')}
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
            placeholder={t('feedPrefs.keyword_placeholder')}
            className="flex-1 min-h-11 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <Button
            type="submit"
            isLoading={muteKeyword.isPending}
            className="min-h-11"
          >
            {t('feedPrefs.mute')}
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
                  aria-label={t('feedPrefs.unmute')}
                >
                  <X size={16} />
                </button>
              </li>
            ),
          )}
          {(data?.mutedKeywords || []).length === 0 && (
            <p className="text-white/40 text-sm">
              {t('feedPrefs.no_keywords')}
            </p>
          )}
        </ul>
      </SettingsSection>

      <SettingsSection title={t('feedPrefs.authors_title')} card={false}>
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
                  {t('feedPrefs.show_again')}
                </Button>
              </li>
            ),
          )}
          {(data?.hiddenAuthors || []).length === 0 && (
            <p className="text-white/40 text-sm">{t('feedPrefs.no_authors')}</p>
          )}
        </ul>
      </SettingsSection>

      <SettingsSection title={t('feedPrefs.posts_title')} card={false}>
        <ul className="space-y-2">
          {(data?.hiddenPosts || []).map(
            (p: {
              postId: string;
              createdAt: string;
              caption?: string | null;
              thumbnailUrl?: string | null;
              authorUsername?: string | null;
            }) => (
              <li
                key={p.postId}
                className="flex items-center justify-between gap-3 p-3 min-h-11 rounded-lg bg-white/5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {p.thumbnailUrl ? (
                    <img
                      src={p.thumbnailUrl}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0 border border-white/10"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <EyeOff
                        size={14}
                        className="text-brand-primary"
                        aria-hidden
                      />
                    </div>
                  )}
                  <div className="min-w-0">
                    {p.authorUsername ? (
                      <p className="text-white text-sm font-medium truncate">
                        @{p.authorUsername}
                      </p>
                    ) : null}
                    <p className="text-white/50 text-xs line-clamp-2">
                      {p.caption?.trim() || t('feedPrefs.hidden_post_fallback')}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() => unhidePost.mutate(p.postId)}
                  className="min-h-11 shrink-0"
                >
                  {t('feedPrefs.show_again')}
                </Button>
              </li>
            ),
          )}
          {(data?.hiddenPosts || []).length === 0 && (
            <p className="text-white/40 text-sm">{t('feedPrefs.no_posts')}</p>
          )}
        </ul>
      </SettingsSection>
    </div>
  );
}
