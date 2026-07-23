import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Plus, Sparkles, Wand2 } from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { CreatorMobileNav } from '../components/creator/CreatorMobileNav';
import type { CreatorTab } from '../components/creator/CreatorSidebar';
import CreatorSidebar from '../components/creator/CreatorSidebar';
import { Button } from '../components/ui';
import type {
  CreatorChartDay,
  CreatorPost,
  CreatorStats,
} from '../services/creator.service';
import { creatorApi } from '../services/creator.service';
import { useAuthStore } from '../stores/authStore';
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
  const [searchParams] = useSearchParams();
  const activeTab = (tab as CreatorTab) || 'overview';
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);
  const profile = useAuthStore((state) => state.profile);
  const { t } = useTranslation();
  const handledPromoReturn = useRef(false);

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
      () => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
      3000,
    );
  }, []);

  // Stripe Checkout return (?promotion=success|cancelled)
  useEffect(() => {
    const status = searchParams.get('promotion');
    if (!status || handledPromoReturn.current) return;
    handledPromoReturn.current = true;

    if (status === 'success') {
      addToast(t('creator.promotions.payment_success'), 'success');
    } else if (status === 'cancelled') {
      addToast(t('creator.promotions.payment_cancelled'), 'error');
    }

    const next = new URLSearchParams(searchParams);
    next.delete('promotion');
    next.delete('id');
    const qs = next.toString();
    navigate(
      { pathname: `/creator/${activeTab}`, search: qs ? `?${qs}` : '' },
      { replace: true },
    );
  }, [activeTab, addToast, navigate, searchParams, t]);

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-6 lg:px-8 max-w-425 mx-auto text-gray-100">
      {/* 1. Header Bar */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-black/50 backdrop-blur-2xl p-4 sm:p-5 rounded-2xl border border-white/10 relative overflow-hidden shadow-2xl">
        {/* Ambient Glow */}
        <div className="absolute top-0 left-0 w-1/3 h-full bg-linear-to-r from-brand-primary/20 via-brand-primary/5 to-transparent blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between md:justify-start gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary/20 rounded-xl flex items-center justify-center border border-brand-primary/30 shadow-[0_0_20px_rgba(var(--brand-primary),0.3)]">
              <Wand2 size={22} className="text-brand-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white tracking-tight leading-tight">
                  {t('creator.title', 'Creator Studio')}
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-2 py-0.5 rounded-full">
                  <Sparkles size={10} /> Pro Studio
                </span>
              </div>
              <p className="text-gray-400 text-xs mt-0.5">
                {t(
                  'creator.subtitle',
                  'Panel de analítica, monetización y contenido',
                )}
              </p>
            </div>
          </div>

          <Link
            to="/"
            className="md:hidden flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} /> App
          </Link>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3 relative z-10">
          {profile?.username && (
            <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-brand-primary/10 border border-brand-primary/20 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-gray-300 font-bold">
                Creador:{' '}
                <span className="text-brand-primary font-black">
                  @{profile.username}
                </span>
              </span>
            </div>
          )}

          <Button
            variant="primary"
            size="sm"
            className="hidden sm:flex items-center gap-2 font-bold"
            onClick={openCreateMenu}
          >
            <Plus size={16} />
            <span>{t('creator.new_content', 'Nuevo Contenido')}</span>
          </Button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <CreatorMobileNav activeTab={activeTab} onTabChange={handleTabChange} />

      {/* 2. Main Grid Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Desktop Sidebar Nav */}
        <CreatorSidebar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Tab Content Area */}
        <main className="flex-1 w-full min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="bg-black/30 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl min-h-150"
            >
              <Suspense
                fallback={
                  <div className="flex flex-col items-center justify-center p-20 opacity-50">
                    <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-4" />
                    <div className="text-sm font-bold text-gray-300">
                      Cargando módulo...
                    </div>
                  </div>
                }
              >
                {activeTab === 'overview' && (
                  <CreatorDashboard
                    onPromote={(post) => setPromotePost(post)}
                    onNavigate={(target) =>
                      handleTabChange(target as CreatorTab)
                    }
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
                  <div className="p-4 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10">
                    <h2 className="text-xl font-bold text-white mb-6">
                      {t('creator.monetization_label', 'Monetization')}
                    </h2>
                    <MonetizationDashboard />
                  </div>
                )}
                {activeTab === 'ads' && (
                  <CreatorPromotionsTab onToast={addToast} />
                )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
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

      {/* Toast Notifications */}
      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 w-full max-w-sm px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`w-full px-6 py-4 rounded-xl text-xs font-black uppercase tracking-wide shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 border backdrop-blur-xl ${
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
        aria-label="Crear Contenido"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
