import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { lazy, Suspense, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CreatorSidebar from '../components/creator/CreatorSidebar';
import type { CreatorTab } from '../components/creator/CreatorSidebar';
import { Button } from '../components/ui';
import { creatorApi } from '../services/creator.service';
import type {
  CreatorChartDay,
  CreatorPost,
  CreatorStats,
} from '../services/creator.service';
import { useUIStore } from '../stores/uiStore';

const CreatorAnalyticsTab = lazy(
  () => import('../components/creator/CreatorAnalyticsTab'),
);
const CreatorDashboard = lazy(
  () => import('../components/creator/CreatorDashboard'),
);
const CreatorMonetizationTab = lazy(
  () => import('../components/creator/CreatorMonetizationTab'),
);
const CreatorPostsTab = lazy(
  () => import('../components/creator/CreatorPostsTab'),
);
const CreatorPromotionsTab = lazy(
  () => import('../components/creator/CreatorPromotionsTab'),
);
const CreatorStoriesTab = lazy(
  () => import('../components/creator/CreatorStoriesTab'),
);
const PromoteModal = lazy(() => import('../components/creator/PromoteModal'));
const MonetizationDashboard = lazy(
  () => import('../components/monetization/MonetizationDashboard'),
);

export default function Creator() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const activeTab = (tab as CreatorTab) || 'overview';
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);

  const handleTabChange = useCallback(
    (newTab: CreatorTab) => {
      navigate(`/creator/${newTab}`);
    },
    [navigate],
  );
  const [promotePost, setPromotePost] = useState<CreatorPost | null>(null);
  const [toasts, setToasts] = useState<
    { id: string; message: string; type: string }[]
  >([]);
  const { t } = useTranslation();

  // ─── Data Fetching ─────────────────────────────────────────────
  const { data: stats } = useQuery<CreatorStats>({
    queryKey: ['creator', 'stats'],
    queryFn: () => creatorApi.getStats().then((r) => r.data),
  });

  const { data: chartData } = useQuery<CreatorChartDay[]>({
    queryKey: ['creator', 'activity-chart'],
    queryFn: () => creatorApi.getActivityChart().then((r) => r.data),
  });

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      3000,
    );
  }, []);

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-6xl mx-auto">
      {/* 1. Header (Matching Admin) */}
      <header className="mb-8 flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <Link
            to="/"
            className="lg:hidden flex w-fit items-center gap-2 text-xs font-bold text-zinc-500 hover:text-white transition-colors group mb-2"
          >
            <ArrowLeft
              size={12}
              className="group-hover:-translate-x-1 transition-transform"
            />
            Volver a la App
          </Link>
          <h1 className="text-xl font-black text-white tracking-tight">
            {t('creator.title')}
          </h1>
          <p className="text-zinc-500 mt-0.5 text-xs">
            {t('creator.subtitle')}
          </p>
        </div>

        <Button variant="primary" size="sm" className="hidden sm:flex" onClick={openCreateMenu}>
          <Plus size={14} className="mr-2" />
          {t('creator.new_content')}
        </Button>
      </header>

      {/* 2. Layout Grid (Matching Admin) */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Sidebar Nav */}
        <CreatorSidebar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Tab Content Area */}
        <main className="flex-1 w-full lg:min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center p-20 opacity-50">
                <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-4" />
                <div className="text-sm font-bold text-gray-400">
                  Cargando módulo...
                </div>
              </div>
            }
          >
            {activeTab === 'overview' && (
              <CreatorDashboard
                onPromote={(post) => setPromotePost(post)}
                onNavigate={(t) => handleTabChange(t as CreatorTab)}
                stats={stats}
                chartData={chartData}
              />
            )}
            {activeTab === 'analytics' && <CreatorAnalyticsTab />}
            {activeTab === 'content' && (
              <CreatorPostsTab onPromote={(post) => setPromotePost(post)} />
            )}
            {activeTab === 'stories' && <CreatorStoriesTab />}
            {activeTab === 'finance' && (
              <CreatorMonetizationTab onToast={addToast} />
            )}
            {activeTab === 'monetization' && (
              <div className="p-4 md:p-4 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10">
                <h2 className="text-xl font-bold text-white mb-6">
                  {t('creator.monetization_label', 'Monetization')}
                </h2>
                <MonetizationDashboard />
              </div>
            )}
            {activeTab === 'ads' && <CreatorPromotionsTab onToast={addToast} />}
          </Suspense>
        </main>
      </div>

      {/* Modals & Overlays */}
      <Suspense fallback={null}>
        {promotePost && (
          <PromoteModal
            post={promotePost}
            onClose={() => setPromotePost(null)}
            onToast={addToast}
          />
        )}
      </Suspense>

      {/* Toast System */}
      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 w-full max-w-sm px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`w-full px-6 py-4 rounded-lg text-xs font-black uppercase tracking-wide shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 border backdrop-blur-xl ${
              t.type === 'success'
                ? 'bg-emerald-500/90 text-white border-emerald-500/20'
                : 'bg-rose-500/90 text-white border-rose-500/20'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Floating Action Button (Mobile Only) */}
      <button
        type="button"
        onClick={openCreateMenu}
        className="sm:hidden fixed bottom-24 right-6 w-14 h-14 bg-brand-primary text-white rounded-full flex items-center justify-center shadow-2xl shadow-brand-primary/40 z-40 active:scale-95 transition-transform"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
