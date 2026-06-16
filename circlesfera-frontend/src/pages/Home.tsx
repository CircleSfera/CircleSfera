import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import { PostSkeleton, StorySkeleton } from '../components/LoadingStates';
import PostCard from '../components/PostCard';
import StoryList from '../components/StoryList';
import { SuggestionsList } from '../components/suggestions/SuggestionsList';
import { feedApi } from '../services';
import { useAuthStore } from '../stores/authStore';

export default function Home() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'foryou' | 'following'>('foryou');

  const { data, isLoading } = useQuery({
    queryKey: ['feed', activeTab],
    queryFn: () =>
      activeTab === 'foryou' ? feedApi.getForYou() : feedApi.getFollowing(),
    enabled: activeTab === 'foryou' || isAuthenticated,
  });

  return (
    <div className="min-h-screen pt-2 pb-32 md:pt-8 md:pb-8">
      <SEO title={t('feed.home_title')} />
      <div className="w-full md:max-w-lg mx-auto">
        {/* Feed Tabs (Hidden on mobile IG, optional) */}
        <div className="flex border-b border-white/10 mb-2 md:mb-6 px-4 md:px-0">
          <button
            type="button"
            onClick={() => setActiveTab('foryou')}
            className={`flex-1 pb-3 text-center font-bold text-[14px] transition-colors ${
              activeTab === 'foryou'
                ? 'text-white border-b-2 border-brand-primary'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t('feed.foryou', 'Para Ti')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('following')}
            className={`flex-1 pb-3 text-center font-bold text-[14px] transition-colors ${
              activeTab === 'following'
                ? 'text-white border-b-2 border-brand-primary'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t('feed.following', 'Siguiendo')}
          </button>
        </div>

        {/* Stories Section */}
        {isLoading ? (
          <div className="glass-panel rounded-2xl p-4 mb-6 flex gap-4 overflow-hidden">
            {['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => (
              <StorySkeleton key={id} />
            ))}
          </div>
        ) : (
          <StoryList />
        )}

        <SuggestionsList />

        <div className="space-y-4 md:space-y-6">
          {!isAuthenticated && activeTab === 'following' ? (
            <div className="text-center py-12 glass-panel rounded-2xl p-8">
              <p className="text-gray-400">
                {t(
                  'feed.login_required',
                  'Inicia sesión para ver tu feed personalizado.',
                )}
              </p>
            </div>
          ) : isLoading ? (
            ['p1', 'p2', 'p3'].map((id) => <PostSkeleton key={id} />)
          ) : data?.data.data.length === 0 ? (
            <div className="text-center py-12 glass-panel rounded-2xl p-8">
              <p className="text-gray-400">{t('feed.no_posts')}</p>
            </div>
          ) : (
            data?.data.data.map((post) => (
              <PostCard key={post.id} post={post} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
