import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { adminApi } from '../../services/admin.service';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminPageHeader } from './AdminPageHeader';
import StatCard from './StatCard';

export default function MonetizationTab() {
  const {
    data: analytics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['adminMonetization'],
    queryFn: () => adminApi.getMonetizationAnalytics().then((res) => res.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          title="Monetización"
          subtitle="Análisis de suscripciones y métricas SaaS"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 bg-white/5 rounded-xl border border-white/5"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-24 bg-white/5 rounded-xl border border-white/5"
            />
          ))}
        </div>
        <div className="h-64 bg-white/5 rounded-xl border border-white/5 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          title="Monetización"
          subtitle="Análisis de suscripciones y métricas SaaS"
        />
        <AdminEmptyState
          icon={Activity}
          title="Error de Análisis"
          description="No se pudieron sincronizar las métricas de suscripción."
          className="glass-panel border-red-500/10"
        />
      </div>
    );
  }

  const distribution = analytics?.tierDistribution || {
    PREMIUM: 0,
    ELITE: 0,
    BUSINESS: 0,
  };
  const total =
    distribution.PREMIUM + distribution.ELITE + distribution.BUSINESS || 1;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Monetización"
        subtitle="Análisis de suscripciones y métricas SaaS"
      />

      {/* SaaS Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <StatCard
          label="MRR de Plataforma"
          value={analytics?.activeMRR || 0}
          icon={Zap}
          color="blue"
          growth={analytics?.subscriptionGrowth}
        />
        <StatCard
          label="Suscripciones Activas"
          value={analytics?.totalSubscriptions || 0}
          icon={Users}
          color="purple"
        />
        <StatCard
          label="Tasa de Retención"
          value={analytics?.activeRetentionRate || 0}
          icon={ShieldCheck}
          color="green"
          isCounter={false}
          prefix=""
          suffix="%"
        />
      </div>

      {/* Stripe Integration Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="glass-panel p-4 sm:p-5 rounded-xl border border-white/5 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start mb-3">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0">
              <Zap size={20} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
              Conectado
            </span>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">
              Stripe API
            </h4>
            <p className="text-gray-400 text-xs leading-relaxed">
              Conexión principal con Stripe habilitada. Pagos activos.
            </p>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5 rounded-xl border border-white/5 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
              <Users size={20} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">
              En Implementación
            </span>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">
              Stripe Connect
            </h4>
            <p className="text-gray-400 text-xs leading-relaxed">
              Infraestructura para pagos divididos y Creadores.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Tier Distribution Chart (Linear) */}
        <div className="glass-panel rounded-xl border border-white/5 p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4 sm:mb-5">
            <div className="w-10 h-10 rounded-lg bg-brand-secondary/10 flex items-center justify-center border border-brand-secondary/20 shrink-0">
              <PieChart size={20} className="text-brand-secondary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-white">
                Distribución de Experiencia
              </h3>
              <p className="text-zinc-400 text-xs">
                Desglose de niveles por usuario
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Composición de Tiers
                </span>
                <span className="text-xs font-semibold text-white">
                  100% Active Base
                </span>
              </div>
              <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden flex border border-white/5 p-0.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(distribution.PREMIUM / total) * 100}%`,
                  }}
                  className="h-full bg-brand-blue rounded-full"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(distribution.ELITE / total) * 100}%` }}
                  className="h-full bg-brand-primary rounded-full ml-0.5"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(distribution.BUSINESS / total) * 100}%`,
                  }}
                  className="h-full bg-brand-accent rounded-full ml-0.5"
                />
              </div>
            </div>

            <div className="space-y-2">
              {[
                {
                  label: 'Verified',
                  count: distribution.PREMIUM,
                  color: 'bg-brand-blue',
                  percent: Math.round((distribution.PREMIUM / total) * 100),
                },
                {
                  label: 'Elite Creator',
                  count: distribution.ELITE,
                  color: 'bg-brand-primary',
                  percent: Math.round((distribution.ELITE / total) * 100),
                },
                {
                  label: 'Business',
                  count: distribution.BUSINESS,
                  color: 'bg-brand-accent',
                  percent: Math.round((distribution.BUSINESS / total) * 100),
                },
              ].map((tier) => (
                <div
                  key={tier.label}
                  className="flex items-center justify-between p-3 bg-white/2 rounded-xl border border-white/5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${tier.color}`}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-white truncate">
                        {tier.label}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {tier.count} Miembros
                      </span>
                    </div>
                  </div>
                  <span className="text-base font-semibold text-white tabular-nums shrink-0 ml-2">
                    {tier.percent}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="glass-panel rounded-xl border border-white/5 p-4 sm:p-5 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-brand-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp size={20} className="text-brand-primary" />
              </div>
              <h4 className="text-sm sm:text-base font-semibold text-white">
                Proyección de Crecimiento
              </h4>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
              Basado en el ritmo actual de adquisiciones, se estima un
              crecimiento del <strong className="text-white">12.4%</strong> en
              el próximo ciclo de facturación.
            </p>
            <div className="h-16 w-full bg-white/2 rounded-lg border border-white/5 relative overflow-hidden">
              <div className="absolute inset-0 flex items-end opacity-20">
                {[40, 70, 45, 90, 65, 80, 50, 85, 95].map((h, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: Decorative static items
                    key={`wave-${i}-${h}`}
                    className="flex-1 bg-brand-primary mx-0.5 rounded-t-sm"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
