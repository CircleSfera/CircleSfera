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
    <div className="min-h-screen pt-4 md:pt-8 pb-32">
      <SEO title={t('feed.home_title')} />
      {/* Header Title - Hidden on mobile as TopNav replaces it */}
      <h1 className="hidden md:block text-2xl md:text-3xl font-black text-center mb-8 tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto]">
        {t('feed.brand_name')}
      </h1>

      <div className="max-w-lg mx-auto px-4">
        {/* Feed Tabs */}
        <div className="flex border-b border-gray-800 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('foryou')}
            className={`flex-1 pb-4 text-center font-bold transition-colors ${
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
            className={`flex-1 pb-4 text-center font-bold transition-colors ${
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
          <div className="glass-panel rounded-lg p-4 mb-6 flex gap-4 overflow-hidden">
            {['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => (
              <StorySkeleton key={id} />
            ))}
          </div>
        ) : (
          <StoryList />
        )}

        <SuggestionsList />

        <div className="space-y-4">
          {!isAuthenticated && activeTab === 'following' ? (
            <div className="text-center py-12 glass-panel rounded-lg p-8">
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
            <div className="text-center py-12 glass-panel rounded-lg p-8">
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
