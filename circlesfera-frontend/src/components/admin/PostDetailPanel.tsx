import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AdminPost } from '../../services/admin.service';
import UserAvatar from '../UserAvatar';

interface Props {
  post: AdminPost;
}

/** Compact post preview for AdminSplitView detail pane (no overlay). */
export default function PostDetailPanel({ post }: Props) {
  const { t } = useTranslation();
  const username = post.user?.profile?.username || t('admin.shared.unknown');

  return (
    <div className="space-y-5 pb-6 px-0.5">
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {t('admin.posts.preview_drawer_title')}
        </p>
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar src={post.user?.profile?.avatar} alt={username} />
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">
              @{username}
            </p>
            <p className="text-xs text-gray-500">
              {new Date(post.createdAt).toLocaleString()}
            </p>
          </div>
          <a
            href={`/post/${post.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 min-h-9 px-2.5 rounded-md text-xs font-semibold text-brand-primary hover:bg-brand-primary/10 shrink-0"
          >
            <ExternalLink size={13} />
            {t('admin.posts.action_view_platform')}
          </a>
        </div>
      </div>

      {post.media && post.media.length > 0 && (
        <div className="bg-black/40 rounded-lg overflow-hidden relative">
          <div className="aspect-4/5 w-full max-h-[min(60vh,28rem)] flex items-center justify-center">
            {post.media[0].type === 'video' ? (
              <video
                src={post.media[0].url}
                controls
                className="w-full h-full object-contain"
              >
                <track kind="captions" />
              </video>
            ) : (
              <img
                src={post.media[0].url}
                alt=""
                className="w-full h-full object-contain"
              />
            )}
          </div>
          {post.media.length > 1 && (
            <div className="absolute top-3 right-3 bg-black/70 text-white text-xs px-2 py-1 rounded-md">
              1/{post.media.length}
            </div>
          )}
        </div>
      )}

      {post.caption ? (
        <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
          {post.caption}
        </p>
      ) : (
        <p className="text-sm text-gray-500 italic">
          {t('admin.posts.no_caption')}
        </p>
      )}

      {post._count && (
        <div className="grid grid-cols-2 rounded-lg bg-white/[0.03] overflow-hidden">
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-semibold text-white tabular-nums leading-none">
              {post._count.likes}
            </p>
            <p className="mt-1 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              {t('admin.posts.stat_likes')}
            </p>
          </div>
          <div className="px-3 py-3 text-center border-l border-white/5">
            <p className="text-lg font-semibold text-white tabular-nums leading-none">
              {post._count.comments}
            </p>
            <p className="mt-1 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              {t('admin.posts.stat_comments')}
            </p>
          </div>
        </div>
      )}

      <dl className="text-sm">
        <div className="flex justify-between gap-3 py-2 border-b border-white/5">
          <dt className="text-gray-500">{t('admin.posts.col_type')}</dt>
          <dd className="text-white font-medium uppercase text-xs tracking-wide">
            {post.type}
          </dd>
        </div>
      </dl>
    </div>
  );
}
