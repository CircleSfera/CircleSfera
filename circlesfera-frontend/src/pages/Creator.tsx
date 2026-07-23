import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
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
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import CreatorShell from '../components/creator/CreatorShell';
import {
  type CreatorTab,
  isCreatorTab,
} from '../components/creator/creatorNav';
import { creatorToast } from '../components/creator/creatorToast';
import type {
  CreatorChartDay,
  CreatorPost,
  CreatorStats,
} from '../services/creator.service';
import { creatorApi } from '../services/creator.service';

const CreatorAnalyticsTab = lazy(
  () => import('../components/creator/CreatorAnalyticsTab'),
);
const CreatorDashboard = lazy(
  () => import('../components/creator/CreatorDashboard'),
);
const CreatorMoneyTab = lazy(
  () => import('../components/creator/CreatorMoneyTab'),
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

export default function Creator() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const handledPromoReturn = useRef(false);
  const [promotePost, setPromotePost] = useState<CreatorPost | null>(null);

  const isFinanceRedirect = tab === 'finance';
  const isInvalidTab = !!tab && !isFinanceRedirect && !isCreatorTab(tab);
  const activeTab: CreatorTab = isCreatorTab(tab) ? tab : 'overview';

  const handleTabChange = useCallback(
    (newTab: CreatorTab) => {
      navigate(`/creator/${newTab}`);
    },
    [navigate],
  );

  const { data: stats } = useQuery<CreatorStats>({
    queryKey: ['creator', 'stats'],
    queryFn: () => creatorApi.getStats().then((r) => r.data),
    enabled: !isFinanceRedirect && !isInvalidTab,
  });

  const { data: chartData } = useQuery<CreatorChartDay[]>({
    queryKey: ['creator', 'activity-chart'],
    queryFn: () => creatorApi.getActivityChart().then((r) => r.data),
    enabled: !isFinanceRedirect && !isInvalidTab,
  });

  // Stripe Checkout return (?promotion=success|cancelled)
  useEffect(() => {
    if (isFinanceRedirect || isInvalidTab) return;
    const status = searchParams.get('promotion');
    if (!status || handledPromoReturn.current) return;
    handledPromoReturn.current = true;

    if (status === 'success') {
      creatorToast(t('creator.promotions.payment_success'), 'success');
    } else if (status === 'cancelled') {
      creatorToast(t('creator.promotions.payment_cancelled'), 'error');
    }

    const next = new URLSearchParams(searchParams);
    next.delete('promotion');
    next.delete('id');
    const qs = next.toString();
    navigate(
      { pathname: `/creator/${activeTab}`, search: qs ? `?${qs}` : '' },
      { replace: true },
    );
  }, [activeTab, isFinanceRedirect, isInvalidTab, navigate, searchParams, t]);

  if (isFinanceRedirect) {
    const qs = searchParams.toString();
    return (
      <Navigate to={`/creator/monetization${qs ? `?${qs}` : ''}`} replace />
    );
  }

  if (isInvalidTab) {
    return <Navigate to="/creator/overview" replace />;
  }

  return (
    <CreatorShell activeTab={activeTab} onTabChange={handleTabChange}>
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
                <div className="text-sm font-semibold text-gray-300">
                  {t('creator.loading_module', 'Cargando módulo...')}
                </div>
              </div>
            }
          >
            {activeTab === 'overview' && (
              <CreatorDashboard
                onPromote={(post) => setPromotePost(post)}
                onNavigate={(target) => handleTabChange(target)}
                stats={stats}
                chartData={chartData}
              />
            )}
            {activeTab === 'analytics' && <CreatorAnalyticsTab />}
            {activeTab === 'content' && (
              <CreatorPostsTab onPromote={(post) => setPromotePost(post)} />
            )}
            {activeTab === 'stories' && <CreatorStoriesTab />}
            {activeTab === 'monetization' && (
              <CreatorMoneyTab onToast={creatorToast} />
            )}
            {activeTab === 'ads' && (
              <CreatorPromotionsTab onToast={creatorToast} />
            )}
          </Suspense>
        </motion.div>
      </AnimatePresence>

      <Suspense fallback={null}>
        {promotePost && (
          <PromoteModal
            post={promotePost}
            onClose={() => setPromotePost(null)}
            onToast={creatorToast}
          />
        )}
      </Suspense>
    </CreatorShell>
  );
}
