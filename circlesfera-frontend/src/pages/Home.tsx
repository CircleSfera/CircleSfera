import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
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

      <div className="max-w-lg lg:max-w-4xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">
          {/* Main Feed Column */}
          <div className="flex-1 w-full max-w-lg mx-auto shrink-0">
            {/* Header Title - Hidden on mobile as TopNav replaces it */}
            <h1 className="hidden md:block text-2xl md:text-3xl font-black text-center mb-8 tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto]">
              {t('feed.brand_name')}
            </h1>
            {/* Feed Tabs */}
            <div className="flex justify-center mb-8">
              <div className="flex items-center gap-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full p-1 shadow-2xl relative z-20">
                <button
                  type="button"
                  onClick={() => setActiveTab('foryou')}
                  className={`px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 relative focus:outline-none ${
                    activeTab === 'foryou'
                      ? 'text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {activeTab === 'foryou' && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute inset-0 bg-white/10 rounded-full shadow-md z-[-1]"
                      transition={{
                        type: 'spring',
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10">
                    {t('feed.foryou', 'Para Ti')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('following')}
                  className={`px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 relative focus:outline-none ${
                    activeTab === 'following'
                      ? 'text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {activeTab === 'following' && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute inset-0 bg-white/10 rounded-full shadow-md z-[-1]"
                      transition={{
                        type: 'spring',
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10">
                    {t('feed.following', 'Siguiendo')}
                  </span>
                </button>
              </div>
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

            {/* Suggestions inline on mobile */}
            <div className="lg:hidden">
              <SuggestionsList layout="horizontal" />
            </div>

            {/* Posts List */}
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
                data?.data.data.map((post, index) => (
                  <PostCard key={post.id} post={post} priority={index === 0} />
                ))
              )}
            </div>
          </div>

          {/* Right Sidebar Suggestions (Desktop Only) */}
          <aside className="hidden lg:block w-[320px] sticky top-24 shrink-0">
            <SuggestionsList layout="vertical" />
          </aside>
        </div>
      </div>
    </div>
  );
}
