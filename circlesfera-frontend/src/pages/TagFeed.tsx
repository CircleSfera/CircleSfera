import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Masonry from 'react-masonry-css';
import { useParams } from 'react-router-dom';
import { LoadingSpinner } from '../components/LoadingStates';
import PostCard from '../components/PostCard';
import LayoutWrapper from '../layouts/LayoutWrapper';
import { postsApi } from '../services';

export default function TagFeed() {
  const { t } = useTranslation();
  const { tag } = useParams<{ tag: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['posts', 'tag', tag],
    queryFn: async () => {
      const res = await postsApi.getByTag(tag!);
      return res.data;
    },
    enabled: !!tag,
  });

  const breakpointColumnsObj = {
    default: 3,
    1100: 2,
    700: 1,
  };

  return (
    <LayoutWrapper>
      <div className="pt-24 pb-20 px-4 min-h-screen max-w-6xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black mb-2 text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-purple-400">
            #{tag}
          </h1>
          <p className="text-gray-400">{t('post.tag_feed.discover')}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <LoadingSpinner size="lg" />
          </div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-20 opacity-50">
            <p className="text-xl font-medium">
              {t('post.tag_feed.no_posts')} #{tag}
            </p>
          </div>
        ) : (
          <Masonry
            breakpointCols={breakpointColumnsObj}
            className="flex w-auto -ml-6"
            columnClassName="pl-6 bg-clip-padding"
          >
            {data?.data.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </Masonry>
        )}
      </div>
    </LayoutWrapper>
  );
}
