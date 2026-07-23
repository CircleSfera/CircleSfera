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
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white/5 rounded-lg" />
          ))}
        </div>
        <div className="h-96 bg-white/5 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 text-center glass-panel rounded-xl border border-red-500/10">
        <Activity size={48} className="text-red-500/20 mx-auto mb-4" />
        <h3 className="text-white font-semibold text-lg">Error de Análisis</h3>
        <p className="text-gray-500">
          No se pudieron sincronizar las métricas de suscripción.
        </p>
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
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* SaaS Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
          growth={5} // Placeholder
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-white/5 flex flex-col justify-between group hover:border-brand-primary/30 transition-all">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
              <Zap size={20} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-green-400 bg-green-400/10 px-2 py-1 rounded-full border border-green-400/20">
              Conectado
            </span>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">
              Stripe API
            </h4>
            <p className="text-gray-300 text-xs">
              Conexión principal con Stripe habilitada. Pagos activos.
            </p>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-white/5 flex flex-col justify-between group hover:border-blue-400/30 transition-all relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Users size={20} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full border border-yellow-400/20">
              En Implementación
            </span>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">
              Stripe Connect
            </h4>
            <p className="text-gray-300 text-xs">
              Infraestructura para pagos divididos y Creadores.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Tier Distribution Chart (Linear) */}
        <div className="glass-panel rounded-xl border border-white/5 p-6 sm:p-8 bg-linear-to-br from-brand-secondary/5 to-transparent">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-brand-secondary/10 flex items-center justify-center border border-brand-secondary/20">
              <PieChart size={28} className="text-brand-secondary" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-semibold text-white">
                Distribución de Experiencia
              </h3>
              <p className="text-zinc-400 text-xs">
                Desglose de niveles por usuario
              </p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Composición de Tiers
                </span>
                <span className="text-xs font-semibold text-white">
                  100% Active Base
                </span>
              </div>
              <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden flex border border-white/5 p-0.5">
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

            <div className="space-y-3">
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
                  className="flex items-center justify-between p-4 bg-white/2 rounded-xl border border-white/5 hover:border-white/10 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${tier.color}`} />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white">
                        {tier.label}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {tier.count} Miembros
                      </span>
                    </div>
                  </div>
                  <span className="text-lg font-semibold text-white tabular-nums group-hover:text-brand-primary transition-colors">
                    {tier.percent}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div className="glass-panel rounded-xl border border-white/5 p-6 sm:p-8 grow bg-linear-to-bl from-brand-primary/5 to-transparent flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-lg bg-brand-primary/10 flex items-center justify-center">
                <TrendingUp size={24} className="text-brand-primary" />
              </div>
              <h4 className="text-lg font-semibold text-white">
                Proyección de Crecimiento
              </h4>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              Basado en el ritmo actual de adquisiciones, se estima un
              crecimiento del <strong className="text-white">12.4%</strong> en
              el próximo ciclo de facturación.
            </p>
            <div className="h-20 w-full bg-white/2 rounded-lg border border-white/5 relative overflow-hidden">
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
