import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { PaginatedResponse } from '../../types';
import PostInsightsModal from '../modals/PostInsightsModal';
import CreatorEmpty from './CreatorEmpty';
import { CreatorPager, CreatorViewChoice } from './CreatorPieces';
import CreatorPostRow from './CreatorPostRow';

interface Props {
  onPromote: (post: CreatorPost) => void;
}

type Kind = 'all' | 'POST' | 'FRAME';

export default function CreatorPostsTab({ onPromote }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<Kind>('all');
  const [insightsPostId, setInsightsPostId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<CreatorPost>>({
    queryKey: ['creator', 'posts', page, kind],
    queryFn: () =>
      creatorApi
        .getPosts(page, 10, kind === 'all' ? undefined : kind)
        .then((r) => r.data),
  });

  const posts = data?.data ?? [];

  return (
    <div className="space-y-4 pb-8">
      <CreatorViewChoice<Kind>
        label={t('creator.posts.filter_label')}
        items={[
          { value: 'all', label: t('creator.posts.filter_all') },
          { value: 'POST', label: t('creator.posts.filter_posts') },
          { value: 'FRAME', label: t('creator.posts.filter_frames') },
        ]}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setPage(1);
        }}
      />

      {isLoading ? (
        <div className="space-y-2">
          {['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => (
            <div
              key={id}
              className="h-20 md:h-15 rounded-xl bg-white/5 animate-pulse border border-white/5"
            />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <CreatorEmpty
          icon={ImageIcon}
          title={t('creator.posts.empty_title')}
          message={t('creator.posts.empty_desc')}
        />
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <CreatorPostRow
              key={post.id}
              post={post}
              onOpen={(opened) => setInsightsPostId(opened.id)}
              onPromote={onPromote}
            />
          ))}
        </div>
      )}

      <CreatorPager
        page={page}
        totalPages={data?.meta?.totalPages ?? 1}
        onChange={setPage}
      />

      {insightsPostId && (
        <PostInsightsModal
          postId={insightsPostId}
          onClose={() => setInsightsPostId(null)}
        />
      )}
    </div>
  );
}
