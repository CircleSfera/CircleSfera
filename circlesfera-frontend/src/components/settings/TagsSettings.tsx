import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  type MyPostTag,
  type PostTagStatus,
  postTagsApi,
} from '../../services';
import { EmptyState } from '../ErrorEmptyStates';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

const tagsKey = (status: PostTagStatus) => ['postTags', status] as const;

/**
 * The active Profile's tags on others' posts: the ones waiting for its
 * approval, and the ones shown on its profile. It approves a waiting one or
 * takes itself off any post; the post's author is not told.
 */
export default function TagsSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const pending = useQuery({
    queryKey: tagsKey('PENDING'),
    queryFn: () => postTagsApi.list('PENDING').then((r) => r.data.data),
  });
  const shown = useQuery({
    queryKey: tagsKey('SHOWN'),
    queryFn: () => postTagsApi.list('SHOWN').then((r) => r.data.data),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['postTags'] });
    // The Tagged tab of the profile changes with them.
    void queryClient.invalidateQueries({ queryKey: ['userTagged'] });
  };

  const approve = useMutation({
    mutationFn: (postId: string) => postTagsApi.approve(postId),
    onSuccess: refresh,
    onError: () => toast.error(t('settings.tags.error')),
  });
  const remove = useMutation({
    mutationFn: (postId: string) => postTagsApi.remove(postId),
    onSuccess: refresh,
    onError: () => toast.error(t('settings.tags.error')),
  });
  const busy = approve.isPending || remove.isPending;

  const row = (tag: MyPostTag) => {
    const { post } = tag;
    const author = post.profile.username;
    return (
      <li
        key={post.id}
        className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/2 p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <Link
          to={`/p/${post.id}`}
          className="flex items-center gap-3 min-w-0 flex-1"
        >
          {post.thumbnailUrl ? (
            <img
              src={post.thumbnailUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover shrink-0"
            />
          ) : (
            <span className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              <ImageOff size={18} className="text-white/40" aria-hidden />
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white truncate">
              {t('settings.tags.by', { username: author })}
            </span>
            {post.caption ? (
              <span className="block text-xs text-white/50 truncate">
                {post.caption}
              </span>
            ) : null}
          </span>
        </Link>
        <div className="flex gap-2 shrink-0 self-end sm:self-auto">
          {tag.status === 'PENDING' ? (
            <Button
              onClick={() => approve.mutate(post.id)}
              isLoading={approve.isPending && approve.variables === post.id}
              disabled={busy}
              className="min-h-11 text-sm font-semibold px-4"
            >
              {t('settings.tags.approve')}
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => remove.mutate(post.id)}
            isLoading={remove.isPending && remove.variables === post.id}
            disabled={busy}
            aria-label={t('settings.tags.remove_label', { username: author })}
            className="min-h-11 text-sm font-semibold px-4"
          >
            {t('settings.tags.remove')}
          </Button>
        </div>
      </li>
    );
  };

  const list = (items: MyPostTag[] | undefined, empty: string) =>
    !items || items.length === 0 ? (
      <EmptyState icon="posts" title={empty} />
    ) : (
      <ul className="space-y-2">{items.map(row)}</ul>
    );

  return (
    <div className="max-w-xl space-y-8">
      <SettingsSection
        title={t('settings.tags.pending_title')}
        description={t('settings.tags.pending_desc')}
        card={false}
      >
        {pending.isLoading
          ? null
          : list(pending.data, t('settings.tags.pending_empty'))}
      </SettingsSection>
      <SettingsSection
        title={t('settings.tags.shown_title')}
        description={t('settings.tags.shown_desc')}
        card={false}
      >
        {shown.isLoading
          ? null
          : list(shown.data, t('settings.tags.shown_empty'))}
      </SettingsSection>
    </div>
  );
}
