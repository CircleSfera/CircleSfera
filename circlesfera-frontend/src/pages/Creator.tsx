import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CreatorAnalyticsTab from '../components/creator/CreatorAnalyticsTab';
import CreatorDashboard from '../components/creator/CreatorDashboard';
import CreatorMonetizationTab from '../components/creator/CreatorMonetizationTab';
import CreatorPostsTab from '../components/creator/CreatorPostsTab';
import CreatorPromotionsTab from '../components/creator/CreatorPromotionsTab';
import type { CreatorTab } from '../components/creator/CreatorSidebar';
import CreatorSidebar from '../components/creator/CreatorSidebar';
import CreatorStoriesTab from '../components/creator/CreatorStoriesTab';
import PromoteModal from '../components/creator/PromoteModal';
import MonetizationDashboard from '../components/monetization/MonetizationDashboard';
import type {
  CreatorChartDay,
  CreatorPost,
  CreatorStats,
} from '../services/creator.service';
import { creatorApi } from '../services/creator.service';

export default function Creator() {
  const [activeTab, setActiveTab] = useState<CreatorTab>('overview');
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
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {t('creator.title')}
          </h1>
          <p className="text-zinc-500 mt-0.5 text-xs">
            {t('creator.subtitle')}
          </p>
        </div>

        <button
          type="button"
          className="hidden sm:flex items-center gap-2 px-6 py-2.5 bg-brand-primary text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:bg-brand-primary/90 transition-all shadow-xl shadow-brand-primary/10"
        >
          <Plus size={14} />
          {t('creator.new_content')}
        </button>
      </header>

      {/* 2. Layout Grid (Matching Admin) */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Sidebar Nav */}
        <CreatorSidebar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab Content Area */}
        <main className="flex-1 w-full lg:min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {activeTab === 'overview' && (
            <CreatorDashboard
              onPromote={(post) => setPromotePost(post)}
              onNavigate={(t) => setActiveTab(t as CreatorTab)}
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
            <div className="p-4 md:p-6 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10">
              <h2 className="text-xl font-bold text-white mb-6">
                {t('creator.monetization_label', 'Monetization')}
              </h2>
              <MonetizationDashboard />
            </div>
          )}
          {activeTab === 'ads' && <CreatorPromotionsTab onToast={addToast} />}
        </main>
      </div>

      {/* Modals & Overlays */}
      {promotePost && (
        <PromoteModal
          post={promotePost}
          onClose={() => setPromotePost(null)}
          onToast={addToast}
        />
      )}

      {/* Toast System */}
      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 w-full max-w-sm px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`w-full px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 border backdrop-blur-xl ${
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
        className="sm:hidden fixed bottom-24 right-6 w-14 h-14 bg-brand-primary text-white rounded-full flex items-center justify-center shadow-2xl shadow-brand-primary/40 z-40 active:scale-95 transition-transform"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
